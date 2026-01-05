/**
 * app.js
 * Hlavní orchestrátor aplikace CandleViewer
 * Spojuje všechny moduly a řídí celý workflow
 */

import { dataFetcher } from './modules/DataFetcher.js';
import { statsEngine } from './modules/StatsEngine.js';
import { backtestProcessor } from './modules/BacktestProcessor.js';
import { chartManager } from './modules/ChartManager.js';
import { stateManager } from './modules/StateManager.js';
import { validateForm } from './utils/validators.js';
import { getToday, getDaysAgo, formatDateForDisplay } from './utils/dateUtils.js';
import { toast } from './utils/ToastNotification.js';

class CandleViewerApp {
    constructor() {
        this.currentAnalysis = null;
        this.currentTrades = null;
        this.pendingHistoryTrades = null; // Trades načtené z historie pro příští analýzu
        this.isLoadingFromHistory = false; // Příznak že běží auto-analýza z historie
        this.init();
    }

    /**
     * Inicializace aplikace
     */
    init() {
        this.setupDOMReferences();
        this.setupEventListeners();
        this.loadURLParams();
        this.renderHistory();
        
        console.log('✅ CandleViewer App initialized');
    }

    /**
     * Setup DOM element references
     */
    setupDOMReferences() {
        // Form elements
        this.form = document.getElementById('analysisForm');
        this.symbolInput = document.getElementById('symbolInput');
        this.startDateInput = document.getElementById('startDateInput');
        this.endDateInput = document.getElementById('endDateInput');
        this.capitalInput = document.getElementById('capitalInput');
        this.intervalInput = document.getElementById('intervalInput');
        this.tradesFileInput = document.getElementById('tradesFileInput');
        this.fileNameDisplay = document.getElementById('fileNameDisplay');
        
        // Buttons
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.resetBtn = document.getElementById('resetBtn');
        
        // Status
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.loadingText = document.getElementById('loadingText');
        this.symbolValidation = document.getElementById('symbolValidation');
        
        // Sections
        this.chartsSection = document.getElementById('chartsSection');
        this.statsSection = document.getElementById('statsSection');
        
        // Chart containers
        this.mainChartContainer = document.getElementById('mainChart');
        this.performanceChartContainer = document.getElementById('performanceChart');
        this.mainChartTitle = document.getElementById('mainChartTitle');
        this.mainChartTitleDefault = this.mainChartTitle ? this.mainChartTitle.textContent : '📈 Main Chart';
        
        // Stats elements
        this.statElements = {
            totalReturn: document.getElementById('statTotalReturn'),
            benchmark: document.getElementById('statBenchmark'),
            sharpe: document.getElementById('statSharpe'),
            sortino: document.getElementById('statSortino'),
            mdd: document.getElementById('statMDD'),
            winRate: document.getElementById('statWinRate'),
            profitFactor: document.getElementById('statProfitFactor'),
            avgProfit: document.getElementById('statAvgProfit'),
            totalTrades: document.getElementById('statTotalTrades'),
            recovery: document.getElementById('statRecovery')
        };
        
        // History
        this.historyList = document.getElementById('historyList');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');

        // Dark Mode Toggle
        this.darkModeToggle = document.getElementById('darkModeToggle');
        
        // Detached Window Button
        this.openDetachedBtn = null; // Bude nastaven po vytvoření grafů

        // Set default dates
        this.endDateInput.value = getToday();
        this.startDateInput.value = getDaysAgo(365); // 1 rok zpět
        this.capitalInput.value = '10000';

        this.updateMainChartTitle(this.symbolInput.value);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAnalyze();
        });

        // Reset button
        this.resetBtn.addEventListener('click', () => {
            this.handleReset();
        });

        // Symbol validation on blur
        this.symbolInput.addEventListener('blur', async () => {
            const symbol = this.symbolInput.value.trim();
            if (symbol) {
                await this.validateSymbol(symbol);
            }
        });

        // File input display
        this.tradesFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.fileNameDisplay.textContent = file.name;
            } else {
                this.fileNameDisplay.textContent = 'Vyberte soubor...';
            }
        });

        if (this.clearHistoryBtn) {
            this.clearHistoryBtn.addEventListener('click', () => {
                this.handleClearHistory();
            });
        }

        // Dark Mode Toggle
        if (this.darkModeToggle) {
            this.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
            // Load saved preference
            const savedTheme = localStorage.getItem('candleviewer-theme');
            if (savedTheme === 'dark') {
                this.setDarkMode(true);
            }
        }
    }

    /**
     * Validuje symbol pomocí backendu
     */
    async validateSymbol(symbol) {
        try {
            const result = await dataFetcher.validateSymbol(symbol);
            
            if (result.valid) {
                this.symbolValidation.textContent = `✓ ${result.name || symbol}`;
                this.symbolValidation.className = 'validation-message success';
            } else {
                this.symbolValidation.textContent = `✗ ${result.error}`;
                this.symbolValidation.className = 'validation-message error';
            }
        } catch (error) {
            this.symbolValidation.textContent = '✗ Chyba při validaci';
            this.symbolValidation.className = 'validation-message error';
        }
    }

    /**
     * Načte parametry z URL pokud existují
     */
    loadURLParams() {
        const params = stateManager.loadFromURL();
        
        if (params) {
            this.symbolInput.value = params.symbol || '';
            this.startDateInput.value = params.startDate || this.startDateInput.value;
            this.endDateInput.value = params.endDate || this.endDateInput.value;
            this.capitalInput.value = params.initialCapital || this.capitalInput.value;
            this.intervalInput.value = params.interval || '1d';
            this.updateMainChartTitle(this.symbolInput.value);
            
            console.log('📍 Načteny parametry z URL:', params);
        }
    }

    /**
     * Hlavní handler pro analýzu
     */
    async handleAnalyze() {
        try {
            // Získat data z formuláře
            const formData = this.getFormData();
            this.updateMainChartTitle(formData.symbol);
            
            // Validace
            const validation = validateForm(formData);
            if (!validation.valid) {
                this.showError(Object.values(validation.errors).join(', '));
                return;
            }

            // Show loading
            this.setLoading(true, 'Stahuji data z yfinance...');
            this.analyzeBtn.disabled = true;

            // 1. Stáhnout OHLCV data
            const marketData = await dataFetcher.fetchMarketData(
                {
                    symbol: formData.symbol,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    interval: formData.interval
                },
                (progress) => this.setLoading(true, progress)
            );

            console.log('📊 Market data sample:', marketData.data.slice(0, 3));

            // 2. Zpracovat trades (pokud jsou)
            let trades = [];
            
            // Priorita: 1) Nahraný soubor, 2) Trades z historie
            if (formData.tradesFile) {
                this.setLoading(true, 'Zpracovávám obchody...');
                trades = await backtestProcessor.processFile(formData.tradesFile);
                console.log(`✅ Načteno ${trades.length} obchodů ze souboru`);
                console.log('📋 Trade sample:', trades.slice(0, 2));
                const missingTimestamps = trades.filter(t => 
                    !t.exitTimestamp || !t.entryTimestamp
                );
                if (missingTimestamps.length > 0) {
                    console.error('❌ Trades missing timestamps:', missingTimestamps);
                    throw new Error('Some trades are missing Unix timestamps');
                }
            } else if (this.pendingHistoryTrades && this.pendingHistoryTrades.length > 0) {
                // Použít trades načtené z historie
                this.setLoading(true, 'Načítám uložené obchody z historie...');
                trades = this.pendingHistoryTrades;
                console.log(`✅ Použito ${trades.length} obchodů z historie`);
            }
            
            // Vyčistit pending trades po použití
            this.pendingHistoryTrades = null;

            this.currentTrades = trades;

            // 3. Vypočítat metriky (FRONTEND!)
            this.setLoading(true, 'Počítám metriky...');
            const metrics = statsEngine.analyzeStrategy({
                trades: trades,
                ohlcvData: marketData.data,
                initialCapital: parseFloat(formData.initialCapital)
            });

            console.log('📈 Equity curve sample:', metrics.equity.strategy.slice(0, 5));
            console.log('📉 Benchmark curve sample:', metrics.equity.benchmark.slice(0, 5));
            console.log('💰 Final values:', {
                strategy: metrics.equity.strategy[metrics.equity.strategy.length - 1],
                benchmark: metrics.equity.benchmark[metrics.equity.benchmark.length - 1]
            });

            // 4. Vykreslit grafy
            this.setLoading(true, 'Vykresluju grafy...');
            const interval = marketData.interval || formData.interval;

            if (formData.viewStart && formData.viewEnd) {
                chartManager.setSavedViewport({
                    from: formData.viewStart,
                    to: formData.viewEnd
                });
            }
            
            this.renderCharts(marketData.data, trades, metrics, interval);

            // 5. Zobrazit statistiky
            this.renderStats(metrics);

            // 6. Uložit do state
            this.currentAnalysis = {
                symbol: formData.symbol,
                startDate: formData.startDate,
                endDate: formData.endDate,
                initialCapital: formData.initialCapital,
                interval: formData.interval,
                metrics: metrics,
                timestamp: new Date().toISOString()
            };

            stateManager.saveToURL(this.currentAnalysis);
            
            // Uložit do historie pouze pokud NENÍ načítání z historie (aby se neduplikovalo)
            if (!this.isLoadingFromHistory) {
                const saveResult = stateManager.saveToHistory(this.currentAnalysis, trades);
                if (saveResult.item && trades.length > 0 && !saveResult.tradesStored) {
                    toast.warning('Obchody se nepodařilo uložit do historie (nedostatek místa)');
                }
            }

            // 7. Refresh history
            this.renderHistory();

            // Show sections
            this.chartsSection.style.display = 'block';
            this.statsSection.style.display = 'block';
            
            // Setup detached window button
            this.setupDetachedWindowButton();

            this.setLoading(false);
            this.showSuccess('✅ Analýza dokončena!');
            
            // Scroll k výsledkům (zejména při načítání z historie)
            if (this.isLoadingFromHistory) {
                // Plynulý scroll k grafům
                setTimeout(() => {
                    this.chartsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }

        } catch (error) {
            console.error('❌ Analysis error:', error);
            this.showError(error.message);
            this.setLoading(false);
        } finally {
            this.analyzeBtn.disabled = false;
            this.isLoadingFromHistory = false; // Reset příznaku
            this.pendingHistoryTrades = null; // Vyčistit pending trades
        }
    }

    /**
     * Získá data z formuláře
     */
    getFormData() {
        return {
            symbol: this.symbolInput.value.trim().toUpperCase(),
            startDate: this.startDateInput.value,
            endDate: this.endDateInput.value,
            initialCapital: this.capitalInput.value,
            interval: this.intervalInput.value,
            tradesFile: this.tradesFileInput.files[0] || null
        };
    }

    /**
     * Vykreslí grafy
     */
    renderCharts(ohlcvData, trades, metrics, interval = '1d') {
        // Initialize charts if not already
        if (!chartManager.mainChart) {
            chartManager.initializeCharts({
                main: this.mainChartContainer,
                performance: this.performanceChartContainer
            });
        }

        // Render
        chartManager.renderAnalysis({
            ohlcvData: ohlcvData,
            trades: trades,
            strategyEquity: metrics.equity.strategy,
            benchmarkEquity: metrics.equity.benchmark
        }, interval);
    }

    /**
     * Aktualizuje nadpis hlavního grafu podle zvoleného tickeru
     */
    updateMainChartTitle(symbol) {
        if (!this.mainChartTitle) return;

        const normalizedSymbol = symbol ? symbol.trim().toUpperCase() : '';
        if (normalizedSymbol) {
            this.mainChartTitle.textContent = `📈 ${normalizedSymbol}`;
        } else {
            this.mainChartTitle.textContent = this.mainChartTitleDefault || '📈 Main Chart';
        }
    }

    /**
     * Zobrazí statistiky
     */
    renderStats(metrics) {
        this.setStatValue('totalReturn', metrics.performance.totalReturn.toFixed(2), '%', true);
        this.setStatValue('benchmark', metrics.performance.benchmarkReturn.toFixed(2), '%', true);

        // Risk
        this.setStatValue('sharpe', metrics.risk.sharpeRatio.toFixed(2));
        this.setStatValue('sortino', metrics.risk.sortinoRatio.toFixed(2));
        this.setStatValue('mdd', metrics.risk.maxDrawdown.toFixed(2), '%', true);
        this.setStatValue('recovery', metrics.risk.recoveryFactor.toFixed(2));
        this.setStatValue('winRate', metrics.trades.winRate.toFixed(2), '%');
        this.setStatValue('profitFactor', metrics.trades.profitFactor.toFixed(2));
        this.setStatValue('avgProfit', metrics.trades.avgProfit.toFixed(2), '$', true);
        this.setStatValue('totalTrades', metrics.trades.total);
    }

    /**
     * Nastaví hodnotu statistiky
     */
    setStatValue(key, value, unit = '', colorize = false) {
        const element = this.statElements[key];
        if (!element) return;

        element.textContent = value;

        if (colorize) {
            const numValue = parseFloat(value);
            if (numValue > 0) {
                element.classList.add('positive');
                element.classList.remove('negative');
            } else if (numValue < 0) {
                element.classList.add('negative');
                element.classList.remove('positive');
            }
        }
    }

    /**
     * Vykreslí historii analýz
     */
    renderHistory() {
        const history = stateManager.getHistory();
        
        if (history.length === 0) {
            this.historyList.innerHTML = '<p class="empty-state">Zatím žádné analýzy</p>';
            return;
        }

        this.historyList.innerHTML = history.map(item => {
            const isWinning = (item.metrics.totalReturn || 0) > 0;
            const noteText = item.note || '';
            const hasNote = noteText.trim().length > 0;
            
            return `
            <div class="history-item ${isWinning ? 'winning' : 'losing'}" data-id="${item.id}">
                <div class="history-item-info">
                    <span class="history-item-symbol">${item.symbol}</span>
                    <span class="history-item-date">${formatDateForDisplay(item.timestamp.split('T')[0])}</span>
                    <span class="history-item-return">${(item.metrics.totalReturn || 0).toFixed(1)}%</span>
                </div>
                <div class="history-item-actions">
                    <button class="history-item-note-btn" data-id="${item.id}" title="${hasNote ? 'Upravit poznámku' : 'Přidat poznámku'}" aria-label="Poznámka">
                        ✏️
                    </button>
                    <button class="history-item-delete" data-id="${item.id}" title="Smazat" aria-label="Smazat analýzu">
                        🗑️
                    </button>
                </div>
                ${hasNote ? `
                <div class="history-item-note" data-id="${item.id}">
                    <span class="note-text">${this.escapeHtml(noteText)}</span>
                </div>
                ` : ''}
            </div>
        `}).join('');

        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('history-item-delete') || 
                    e.target.classList.contains('history-item-note-btn') ||
                    e.target.closest('.history-item-note-edit')) {
                    return;
                }
                
                const id = parseInt(item.dataset.id);
                this.loadHistoryItem(id);
            });
        });

        document.querySelectorAll('.history-item-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.editHistoryNote(id);
            });
        });

        document.querySelectorAll('.history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.handleDeleteHistoryItem(id);
            });
        });
    }

    /**
     * Inline editing poznámky v historii
     * @param {number} id - ID záznamu
     */
    editHistoryNote(id) {
        const item = stateManager.getHistoryItem(id);
        if (!item) return;

        const historyItemEl = document.querySelector(`.history-item[data-id="${id}"]`);
        if (!historyItemEl) return;

        // Najdi nebo vytvoř note sekci
        let noteEl = historyItemEl.querySelector('.history-item-note');
        const currentNote = item.note || '';

        if (!noteEl) {
            noteEl = document.createElement('div');
            noteEl.className = 'history-item-note';
            noteEl.dataset.id = id;
            historyItemEl.appendChild(noteEl);
        }

        // Vytvoř inline editor
        noteEl.innerHTML = `
            <div class="history-item-note-edit">
                <input 
                    type="text" 
                    class="note-input" 
                    value="${this.escapeHtml(currentNote)}" 
                    placeholder="Přidat poznámku..."
                    maxlength="200"
                    autofocus
                />
                <div class="note-edit-actions">
                    <button class="note-save-btn" title="Uložit">✓</button>
                    <button class="note-cancel-btn" title="Zrušit">✗</button>
                </div>
            </div>
        `;

        const input = noteEl.querySelector('.note-input');
        const saveBtn = noteEl.querySelector('.note-save-btn');
        const cancelBtn = noteEl.querySelector('.note-cancel-btn');

        // Focus input
        input.focus();
        input.select();

        // Save handler
        const saveNote = () => {
            const newNote = input.value.trim();
            const success = stateManager.updateHistoryItem(id, { note: newNote });
            
            if (success) {
                this.renderHistory();
                toast.success(newNote ? 'Poznámka uložena' : 'Poznámka smazána');
            } else {
                toast.error('Nepodařilo se uložit poznámku');
            }
        };

        // Cancel handler
        const cancelEdit = () => {
            this.renderHistory();
        };

        // Event listeners
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            saveNote();
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelEdit();
        });

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                saveNote();
            } else if (e.key === 'Escape') {
                cancelEdit();
            }
        });
    }

    /**
     * Escapuje HTML pro prevenci XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Setup detached window button event listener
     */
    setupDetachedWindowButton() {
        this.openDetachedBtn = document.getElementById('openDetachedBtn');
        if (this.openDetachedBtn) {
            this.openDetachedBtn.addEventListener('click', () => {
                chartManager.openDetachedWindow();
            });
        }
    }

    /**
     * Smaže konkrétní záznam z historie
     */
    handleDeleteHistoryItem(id) {
        const success = stateManager.deleteHistoryItem(id);
        if (success) {
            this.renderHistory();
            toast.success('Analýza smazána z historie');
        } else {
            toast.error('Nepodařilo se smazat analýzu');
        }
    }

    /**
     * Načte analýzu z historie a automaticky spustí analýzu
     */
    async loadHistoryItem(id) {
        const item = stateManager.getHistoryItem(id);
        if (!item) return;

        // Vyplnit formulář
        this.symbolInput.value = item.symbol;
        this.startDateInput.value = item.startDate;
        this.endDateInput.value = item.endDate;
        this.capitalInput.value = item.initialCapital;
        this.intervalInput.value = item.interval || '1d';
        this.updateMainChartTitle(item.symbol);
        
        // Vyčistit file input aby nedocházelo ke konfliktům
        this.tradesFileInput.value = '';
        this.fileNameDisplay.textContent = 'Vyberte soubor...';
        
        // Načíst uložené trades z historie (pokud existují)
        const storedTrades = stateManager.getTradesForItem(id);
        if (storedTrades && storedTrades.length > 0) {
            this.pendingHistoryTrades = storedTrades;
            console.log(`📂 Připraveno ${storedTrades.length} obchodů z historie`);
        } else {
            this.pendingHistoryTrades = null;
            console.log('ℹ️ Žádné uložené obchody pro tuto položku');
        }
        
        // Nastavit příznak a automaticky spustit analýzu
        this.isLoadingFromHistory = true;
        
        // Spustit analýzu (scroll k výsledkům proběhne po dokončení)
        await this.handleAnalyze();
    }

    /**
     * Reset formuláře
     */
    handleReset() {
        this.form.reset();
        this.endDateInput.value = getToday();
        this.startDateInput.value = getDaysAgo(365);
        this.capitalInput.value = '10000';
        this.fileNameDisplay.textContent = 'Vyberte soubor...';
        this.symbolValidation.textContent = '';
        this.updateMainChartTitle(null);
        
        this.chartsSection.style.display = 'none';
        this.statsSection.style.display = 'none';
        
        stateManager.clearURL();
        this.currentAnalysis = null;
        this.currentTrades = null;
    }

    /**
     * Vymaže historii analýz
     */
    handleClearHistory() {
        stateManager.clearHistory();
        this.renderHistory();
    }

    /**
     * Loading state
     */
    setLoading(isLoading, message = '') {
        if (isLoading) {
            this.loadingIndicator.style.display = 'block';
            if (message) this.loadingText.textContent = message;
        } else {
            this.loadingIndicator.style.display = 'none';
        }
    }

    /**
     * Show error message - now with Toast notifications
     */
    showError(message) {
        toast.error(message);
    }

    /**
     * Show success message - now with Toast notifications
     */
    showSuccess(message) {
        toast.success(message);
    }

    /**
     * Toggle Dark Mode
     */
    toggleDarkMode() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setDarkMode(newTheme === 'dark');
    }

    /**
     * Set Dark Mode
     */
    setDarkMode(isDark) {
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('candleviewer-theme', 'dark');
            if (this.darkModeToggle) {
                this.darkModeToggle.querySelector('.toggle-icon').textContent = '☀️';
            }
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('candleviewer-theme', 'light');
            if (this.darkModeToggle) {
                this.darkModeToggle.querySelector('.toggle-icon').textContent = '🌙';
            }
        }

        // Update charts if they exist
        if (chartManager.mainChart && chartManager.performanceChart) {
            const chartBg = isDark ? '#2A2A2A' : '#FFFFFF';
            const textColor = isDark ? '#E8E8E8' : '#333';
            const gridColor = isDark ? '#404040' : '#F0F0F0';

            [chartManager.mainChart, chartManager.performanceChart].forEach(chart => {
                chart.applyOptions({
                    layout: {
                        background: { color: chartBg },
                        textColor: textColor
                    },
                    grid: {
                        vertLines: { color: gridColor },
                        horzLines: { color: gridColor }
                    }
                });
            });
        }
    }
}

// Inicializace aplikace po načtení DOM
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CandleViewerApp();
});
