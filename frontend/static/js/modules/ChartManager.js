/**
 * ChartManager.js
 * Zodpovědnost: Wrapper pro Lightweight Charts s podporou synchronizace
 * - Multi-chart setup (Main + Performance)
 * - Synchronizace crosshair a time scale
 * - Trade markers
 * - Responsive handling
 */

import { transformOHLCVForChart, transformEquityForChart, createTradeMarkers } from '../utils/dataTransform.js';
import { backtestProcessor } from './BacktestProcessor.js';

export class ChartManager {
    constructor() {
        this.charts = [];
        this.mainChart = null;
        this.performanceChart = null;
        this.isSyncing = false;
        this.currentInterval = '1d';
        this.mainChartLegend = null;
        this.performanceChartLegend = null;
        this.savedViewport = null;
        this.currentChartData = null;
    }

    /**
     * @param {Object} containers
     */
    initializeCharts(containers) {
        const commonOptions = {
            layout: {
                background: { color: '#FFFFFF' },
                textColor: '#333'
            },
            grid: {
                vertLines: { color: '#F0F0F0' },
                horzLines: { color: '#F0F0F0' }
            },
            crosshair: {
                mode: window.LightweightCharts.CrosshairMode.Normal
            },
            timeScale: {
                borderColor: '#E0E0E0'
            },
            rightPriceScale: {
                borderColor: '#E0E0E0'
            }
        };

        // Main Chart (Candlesticks)
        this.mainChart = window.LightweightCharts.createChart(
            containers.main,
            {
                ...commonOptions,
                height: 400
            }
        );

        // Performance Chart (Equity curves)
        this.performanceChart = window.LightweightCharts.createChart(
            containers.performance,
            {
                ...commonOptions,
                height: 300
            }
        );

        this.charts = [this.mainChart, this.performanceChart];
        this.mainChartLegend = document.getElementById('mainChartLegend');
        this.performanceChartLegend = document.getElementById('performanceChartLegend');
        this._setupSynchronization();
        this._setupViewportTracking();
        this._setupResponsive(containers);
    }

    /**
     * Vykreslí kompletní analýzu
     * @param {Object} data
     * @param {Array} data.ohlcvData - OHLCV data
     * @param {Array} data.trades - Trades
     * @param {Array} data.strategyEquity - Strategy equity curve
     * @param {Array} data.benchmarkEquity - Benchmark equity curve
     */
    renderAnalysis(data, interval = '1d') {
        this.currentInterval = interval;
        this.currentChartData = {
            ohlcvData: data.ohlcvData,
            trades: data.trades,
            strategyEquity: data.strategyEquity,
            benchmarkEquity: data.benchmarkEquity,
            interval: interval
        };
        
        this._applyTimeOptions(interval);
        this._renderMainChart(data.ohlcvData, data.trades);
        this._renderPerformanceChart(data.strategyEquity, data.benchmarkEquity);

        if (this.savedViewport && this.savedViewport.from && this.savedViewport.to) {
            console.log('🔗 Restoring viewport from URL:', this.savedViewport);
            this.mainChart.timeScale().setVisibleRange(this.savedViewport);
            this.performanceChart.timeScale().setVisibleRange(this.savedViewport);
        } else {
            this.mainChart.timeScale().fitContent();
            this.performanceChart.timeScale().fitContent();
        }
    }

    /**
     * Vykreslí main chart (candlesticks + volume + markers)
     * @private
     */
    _renderMainChart(ohlcvData, trades) {
        if (this.mainChart && this.mainChart._candlestickSeries) {
            this.mainChart.removeSeries(this.mainChart._candlestickSeries);
            this.mainChart._candlestickSeries = null;
        }

        const sanitizedData = this._sanitizeTimeSeries(ohlcvData);
        const candlesticks = transformOHLCVForChart(sanitizedData);
        const candlestickSeries = this.mainChart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderUpColor: '#26a69a',
            borderDownColor: '#ef5350',
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350'
        });

        candlestickSeries.setData(candlesticks);

        if (trades && trades.length > 0) {
            const validTrades = this._filterTradesAgainstSeries(trades, sanitizedData);
            if (validTrades.length > 0) {
                const markers = createTradeMarkers(validTrades);
                const dedupedMarkers = this._sanitizeTimeSeries(markers);
                candlestickSeries.setMarkers(dedupedMarkers);
            }
        }

        this.mainChart._candlestickSeries = candlestickSeries;
    }

    /**
     * Vykreslí performance chart (equity curves)
     * @private
     */
    _renderPerformanceChart(strategyEquity, benchmarkEquity) {
        if (this.performanceChart._strategySeries) {
            this.performanceChart.removeSeries(this.performanceChart._strategySeries);
        }
        if (this.performanceChart._benchmarkSeries) {
            this.performanceChart.removeSeries(this.performanceChart._benchmarkSeries);
        }
        
        const strategyData = this._sanitizeTimeSeries(
            transformEquityForChart(strategyEquity)
        );
        const benchmarkData = this._sanitizeTimeSeries(
            transformEquityForChart(benchmarkEquity)
        );

        console.log('📊 Performance chart data prepared:', {
            strategy: strategyData.slice(0, 3),
            benchmark: benchmarkData.slice(0, 3)
        });

        // Strategy line
        const strategySeries = this.performanceChart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
            title: 'Strategy',
            priceLineVisible: true,
            lastValueVisible: true
        });

        strategySeries.setData(strategyData);

        // Benchmark line
        const benchmarkSeries = this.performanceChart.addLineSeries({
            color: '#FF6D00',
            lineWidth: 2,
            lineStyle: 2,
            title: 'Buy & Hold',
            priceLineVisible: true,
            lastValueVisible: true
        });

        benchmarkSeries.setData(benchmarkData);

        this.performanceChart._strategySeries = strategySeries;
        this.performanceChart._benchmarkSeries = benchmarkSeries;

        this._setupPerformanceChartLegend(strategySeries, benchmarkSeries);
    }

    /**
     * Setup performance chart legend
     * @private
     */
    _setupPerformanceChartLegend(strategySeries, benchmarkSeries) {
        if (!this.performanceChartLegend) return;

        this.performanceChartLegend.innerHTML = `
            <span style="color: #2962FF; font-weight: bold;">Strategy:</span> <span id="legendStrategy">-</span> | 
            <span style="color: #FF6D00; font-weight: bold;">Buy & Hold:</span> <span id="legendBenchmark">-</span>
        `;

        const legendStrategy = document.getElementById('legendStrategy');
        const legendBenchmark = document.getElementById('legendBenchmark');

        this.performanceChart.subscribeCrosshairMove(param => {
            if (!param.time || !param.seriesData || param.seriesData.size === 0) {
                legendStrategy.textContent = '-';
                legendBenchmark.textContent = '-';
                return;
            }

            const strategyData = param.seriesData.get(strategySeries);
            const benchmarkData = param.seriesData.get(benchmarkSeries);

            if (strategyData && strategyData.value !== undefined) {
                legendStrategy.textContent = `$${strategyData.value.toFixed(2)}`;
            } else {
                legendStrategy.textContent = '-';
            }

            if (benchmarkData && benchmarkData.value !== undefined) {
                legendBenchmark.textContent = `$${benchmarkData.value.toFixed(2)}`;
            } else {
                legendBenchmark.textContent = '-';
            }
        });
    }

    /**
     * Setup viewport tracking for deep linking
     * @private
     */
    _setupViewportTracking() {
        import('./StateManager.js').then(module => {
            const stateManager = module.stateManager;
            let saveTimeout = null;

            this.mainChart.timeScale().subscribeVisibleTimeRangeChange(timeRange => {
                if (!timeRange || this.isSyncing) return;

                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    const currentParams = stateManager.loadFromURL();
                    if (currentParams) {
                        stateManager.saveToURL({
                            ...currentParams,
                            viewStart: timeRange.from,
                            viewEnd: timeRange.to
                        });
                    }
                }, 500);
            });
        });
    }

    /**
     * @param {Object} viewport - {from: number, to: number}
     */
    setSavedViewport(viewport) {
        this.savedViewport = viewport;
    }

    /**
     * Synchronizace crosshair a time scale mezi grafy
     * @private
     */
    _setupSynchronization() {
        // Synchronize crosshair
        this.charts.forEach(chart => {
            chart.subscribeCrosshairMove(param => {
                if (this.isSyncing) return;
                this.isSyncing = true;

                this.charts.forEach(c => {
                    if (c !== chart) {
                        c.setCrosshairPosition(
                            param.point?.x ?? null,
                            param.time,
                            param.seriesData
                        );
                    }
                });

                this.isSyncing = false;
            });
        });

        // Synchronize time scale (zoom & scroll)
        this.charts.forEach(chart => {
            chart.timeScale().subscribeVisibleTimeRangeChange(timeRange => {
                if (this.isSyncing || !timeRange) return;
                this.isSyncing = true;

                this.charts.forEach(c => {
                    if (c !== chart) {
                        c.timeScale().setVisibleRange(timeRange);
                    }
                });

                this.isSyncing = false;
            });
        });
    }

    /**
     * Responsive handling
     * @private
     */
    _setupResponsive(containers) {
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width } = entry.contentRect;
                
                if (entry.target === containers.main) {
                    this.mainChart.applyOptions({ width });
                } else if (entry.target === containers.performance) {
                    this.performanceChart.applyOptions({ width });
                }
            }
        });

        resizeObserver.observe(containers.main);
        resizeObserver.observe(containers.performance);

        this._resizeObserver = resizeObserver;
    }

    /**
     * Update legend (pro zobrazení aktuálních hodnot)
     * @param {HTMLElement} legendElement
     * @param {Object} data
     */
    updateLegend(legendElement, data) {
        if (!legendElement) return;

        legendElement.innerHTML = `
            <span><strong>${data.symbol}</strong></span>
            <span>O: ${data.open} H: ${data.high} L: ${data.low} C: ${data.close}</span>
            ${data.change ? `<span style="color: ${data.change >= 0 ? '#26a69a' : '#ef5350'}">
                ${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%
            </span>` : ''}
        `;
    }

    /**
     * Vyčistí všechny grafy
     */
    clearCharts() {
        this.charts.forEach(chart => {
            chart.remove();
        });

        this.charts = [];
        this.mainChart = null;
        this.performanceChart = null;

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
    }

    /**
     * Reset zoom na všech grafech
     */
    resetZoom() {
        this.charts.forEach(chart => {
            chart.timeScale().fitContent();
        });
    }

    _applyTimeOptions(interval) {
        if (!this.charts || this.charts.length === 0) return;

        const isIntraday = interval && !['1d', '1wk'].includes(interval);
        const timeFormatter = isIntraday
            ? (time) => this._formatIntradayLabel(time)
            : (time) => this._formatDateLabel(time);

        this.charts.forEach(chart => {
            chart.applyOptions({
                timeScale: {
                    borderColor: '#E0E0E0',
                    timeVisible: isIntraday,
                    secondsVisible: false
                },
                localization: {
                    timeFormatter
                }
            });
        });
    }

    _formatDateLabel(time) {
        if (typeof time === 'string') return time;
        if (typeof time === 'number') return this._formatDate(new Date(time * 1000));
        if (time && typeof time === 'object' && 'year' in time) {
            return this._formatDate(new Date(Date.UTC(time.year, (time.month || 1) - 1, time.day || 1)));
        }
        return '';
    }

    _formatIntradayLabel(time) {
        if (typeof time === 'number') return this._formatDateTime(new Date(time * 1000));
        if (typeof time === 'string') return time;
        if (time && typeof time === 'object' && 'year' in time) {
            return this._formatDateTime(new Date(Date.UTC(time.year, (time.month || 1) - 1, time.day || 1)));
        }
        return '';
    }

    _formatDate(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    _formatDateTime(date) {
        const base = this._formatDate(date);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${base} ${hours}:${minutes}`;
    }

    /**
     * Sanitize and deduplicate time series data
     * Optimized for large datasets with early exit checks
     */
    _sanitizeTimeSeries(data = [], getTime = item => item?.time) {
        if (!Array.isArray(data) || data.length === 0) return [];

        if (data.length > 10000) {
            const startTime = performance.now();
            const result = this._sanitizeTimeSeriesLarge(data, getTime);
            const elapsed = performance.now() - startTime;
            if (elapsed > 100) {
                console.warn(`Large dataset sanitization took ${elapsed.toFixed(0)}ms for ${data.length} items`);
            }
            return result;
        }

        const normalized = data
            .map(item => ({
                item,
                sortValue: this._getComparableTime(getTime(item))
            }))
            .filter(entry => entry.sortValue !== null)
            .sort((a, b) => a.sortValue - b.sortValue);

        const deduped = [];
        const indexByKey = new Map();

        normalized.forEach(({ item }) => {
            const key = this._normalizeTimeKey(getTime(item));
            if (!key) return;

            if (indexByKey.has(key)) {
                deduped[indexByKey.get(key)] = item;
            } else {
                indexByKey.set(key, deduped.length);
                deduped.push(item);
            }
        });

        return deduped;
    }

    /**
     * Optimized sanitization for large datasets (>10k items)
     * Uses chunking to prevent UI freezing
     */
    _sanitizeTimeSeriesLarge(data, getTime) {
        const normalized = [];
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            const sortValue = this._getComparableTime(getTime(item));
            if (sortValue !== null) {
                normalized.push({ item, sortValue });
            }
        }

        normalized.sort((a, b) => a.sortValue - b.sortValue);

        // Deduplicate with Map (O(n))
        const deduped = [];
        const seen = new Map();

        for (let i = 0; i < normalized.length; i++) {
            const { item } = normalized[i];
            const key = this._normalizeTimeKey(getTime(item));
            if (!key) continue;

            if (seen.has(key)) {
                deduped[seen.get(key)] = item;
            } else {
                seen.set(key, deduped.length);
                deduped.push(item);
            }
        }

        return deduped;
    }

    _filterTradesAgainstSeries(trades, sanitizedSeries) {
        if (!Array.isArray(trades) || !Array.isArray(sanitizedSeries)) return [];
        if (sanitizedSeries.length === 0) return [];

        const validTrades = trades.filter(trade => {
            try {
                const entryMatch = backtestProcessor.matchTradeToCandle(
                    trade, 
                    sanitizedSeries, 
                    this.currentInterval, 
                    true  // isEntry = true
                );
                
                const exitMatch = backtestProcessor.matchTradeToCandle(
                    trade, 
                    sanitizedSeries, 
                    this.currentInterval, 
                    false  // isEntry = false
                );

                return entryMatch !== null && exitMatch !== null;
            } catch (error) {
                console.warn(`Failed to match trade ${trade.id}:`, error);
                return false;
            }
        });

        if (validTrades.length < trades.length) {
            const filtered = trades.length - validTrades.length;
            console.log(`Filtered ${filtered} trades that don't match candle data (${validTrades.length}/${trades.length} trades matched)`);
        }

        return validTrades;
    }

    _getComparableTime(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (value && typeof value === 'object' && 'year' in value) {
            return new Date(Date.UTC(value.year, (value.month || 1) - 1, value.day || 1)).getTime();
        }
        return null;
    }

    _normalizeTimeKey(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'object') {
            if ('time' in value) {
                return this._normalizeTimeKey(value.time);
            }
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    }

    /**
     * Otevře grafy v samostatném okně
     * Vytvoří popup s plnou funkčností včetně toolbaru pro screenshot
     */
    openDetachedWindow() {
        if (!this.currentChartData) {
            console.warn('Žádná data pro otevření v novém okně');
            return;
        }

        // Uložit data do localStorage pro přenos do nového okna
        const dataKey = 'candleviewer_detached_data';
        try {
            localStorage.setItem(dataKey, JSON.stringify(this.currentChartData));
        } catch (error) {
            console.error('Chyba při ukládání dat pro detached window:', error);
            alert('Nepodařilo se uložit data pro nové okno. Data mohou být příliš velká.');
            return;
        }

        // Otevřít popup okno
        const width = 1200;
        const height = 800;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        const popup = window.open(
            '',
            'CandleViewerDetached',
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        if (!popup) {
            alert('❌ Prohlížeč blokuje popup okna. Povolte prosím vyskakovací okna pro tento web.');
            return;
        }

        // Generovat HTML obsah pro popup
        const popupHTML = this._generateDetachedWindowHTML();
        popup.document.write(popupHTML);
        popup.document.close();

        // Po načtení inicializovat grafy
        popup.addEventListener('load', () => {
            this._initializeDetachedCharts(popup, dataKey);
        });
    }

    /**
     * Generuje HTML pro detached window
     * @private
     */
    _generateDetachedWindowHTML() {
        return `
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CandleViewer - Main Chart</title>
    <script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #FFFFFF;
            color: #333333;
        }
        #mainChart {
            width: 100vw;
            height: 100vh;
            position: absolute;
            top: 0;
            left: 0;
        }
        #drawingCanvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 100;
        }
        #drawingCanvas.active {
            pointer-events: auto;
            /* Černý crosshair cursor (SVG), s fallbackem na systémový crosshair */
            cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><line x1="8" y1="0" x2="8" y2="16" stroke="black" stroke-width="2"/><line x1="0" y1="8" x2="16" y2="8" stroke="black" stroke-width="2"/></svg>') 8 8, crosshair;
        }
        .toolbar {
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid #E0E0E0;
            border-radius: 8px;
            padding: 8px;
            display: flex;
            gap: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            backdrop-filter: blur(10px);
        }
        .toolbar-btn {
            background: #2962FF;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .toolbar-btn:hover {
            background: #0039CB;
            transform: translateY(-1px);
        }
        .toolbar-btn.active {
            background: #26a69a;
            box-shadow: 0 0 0 3px rgba(38, 166, 154, 0.3);
        }
        .toolbar-btn.secondary {
            background: #757575;
        }
        .toolbar-btn.secondary:hover {
            background: #616161;
        }
        .toolbar-divider {
            width: 1px;
            background: #E0E0E0;
            margin: 0 4px;
        }
        .color-picker {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .color-picker input {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            padding: 0;
        }
        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #26a69a;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1001;
        }
        .toast.show { opacity: 1; }
    </style>
</head>
<body>
    <div id="mainChart"></div>
    <canvas id="drawingCanvas"></canvas>
    
    <div class="toolbar">
        <button class="toolbar-btn" id="screenshotBtn" title="Stáhnout screenshot">
            📷 Screenshot
        </button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" id="drawBtn" title="Kreslit tužkou">
            ✏️ Kreslit
        </button>
        <div class="color-picker">
            <input type="color" id="drawColor" value="#ef5350" title="Barva tužky">
        </div>
        <button class="toolbar-btn secondary" id="clearDrawBtn" title="Smazat kresby">
            🗑️
        </button>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        // Placeholder - bude nahrazeno při inicializaci
        window.CANDLEVIEWER_DATA_KEY = null;
    <\/script>
</body>
</html>
        `;
    }

    /**
     * Inicializuje grafy v detached window
     * @private
     */
    _initializeDetachedCharts(popup, dataKey) {
        try {
            const dataStr = localStorage.getItem(dataKey);
            if (!dataStr) {
                console.error('Data pro detached window nenalezena');
                return;
            }

            const data = JSON.parse(dataStr);
            const doc = popup.document;

            const chartOptions = {
                layout: {
                    background: { color: '#FFFFFF' },
                    textColor: '#333333'
                },
                grid: {
                    vertLines: { color: '#F0F0F0' },
                    horzLines: { color: '#F0F0F0' }
                },
                crosshair: {
                    mode: popup.LightweightCharts.CrosshairMode.Normal,
                    vertLine: {
                        color: '#2962FF',
                        width: 1,
                        style: popup.LightweightCharts.LineStyle.Dashed
                    },
                    horzLine: {
                        color: '#2962FF',
                        width: 1,
                        style: popup.LightweightCharts.LineStyle.Dashed
                    }
                },
                timeScale: {
                    borderColor: '#E0E0E0',
                    timeVisible: true,
                    secondsVisible: false
                },
                rightPriceScale: {
                    borderColor: '#E0E0E0'
                }
            };

            const mainChart = popup.LightweightCharts.createChart(
                doc.getElementById('mainChart'),
                chartOptions
            );

            const candleSeries = mainChart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350'
            });

            const transformedOHLCV = this._transformDataForDetached(data.ohlcvData);
            candleSeries.setData(transformedOHLCV);

            if (data.trades && data.trades.length > 0) {
                const markers = this._createTradeMarkersForDetached(data.trades);
                if (markers.length > 0) {
                    const sortedMarkers = this._sanitizeTimeSeries(markers);
                    candleSeries.setMarkers(sortedMarkers);
                    console.log(`📍 Přidáno ${sortedMarkers.length} trade markerů do detached window`);
                }
            }

            mainChart.timeScale().fitContent();

            popup.mainChart = mainChart;
            popup.candleSeries = candleSeries;

            const chartContainer = doc.getElementById('mainChart');
            const drawingCanvas = doc.getElementById('drawingCanvas');
            
            const resizeHandler = () => {
                const width = popup.innerWidth;
                const height = popup.innerHeight;
                mainChart.applyOptions({ width, height });
                
                drawingCanvas.width = width;
                drawingCanvas.height = height;
            };
            
            const resizeObserver = new ResizeObserver(entries => {
                if (entries.length === 0) return;
                resizeHandler();
            });
            
            resizeObserver.observe(chartContainer);
            popup.addEventListener('resize', resizeHandler);
            
            drawingCanvas.width = popup.innerWidth;
            drawingCanvas.height = popup.innerHeight;

            doc.getElementById('screenshotBtn').addEventListener('click', () => {
                this._takeScreenshotInDetached(popup, mainChart, drawingCanvas);
            });

            this._initializeDrawingTool(popup, doc, drawingCanvas);

        } catch (error) {
            console.error('Chyba při inicializaci detached charts:', error);
        }
    }

    /**
     * Vytvoří trade markery pro detached window
     * @private
     */
    _createTradeMarkersForDetached(trades) {
        if (!Array.isArray(trades) || trades.length === 0) return [];

        const markers = [];
        for (const trade of trades) {
            const entryTime = trade.entryTimeNormalized || trade.entryTime;
            const exitTime = trade.exitTimeNormalized || trade.exitTime;
            
            // Entry marker
            markers.push({
                time: entryTime,
                position: 'belowBar',
                color: trade.type === 'long' ? '#2196F3' : '#FF9800',
                shape: 'arrowUp',
                text: `${trade.type.toUpperCase()} @ ${trade.entryPrice.toFixed(2)}`
            });

            // Exit marker
            const exitColor = trade.pnl > 0 ? '#26a69a' : '#ef5350';
            markers.push({
                time: exitTime,
                position: 'aboveBar',
                color: exitColor,
                shape: 'arrowDown',
                text: `Exit @ ${trade.exitPrice.toFixed(2)} (${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)})`
            });
        }
        return markers;
    }

    /**
     * Inicializuje kreslící nástroj v detached window
     * @private
     */
    _initializeDrawingTool(popup, doc, canvas) {
        const ctx = canvas.getContext('2d');
        const drawBtn = doc.getElementById('drawBtn');
        const clearBtn = doc.getElementById('clearDrawBtn');
        const colorPicker = doc.getElementById('drawColor');
        
        let isDrawing = false;
        let isDrawMode = false;
        let lastX = 0;
        let lastY = 0;
        let drawColor = colorPicker.value;
        let lineWidth = 3;

        drawBtn.addEventListener('click', () => {
            isDrawMode = !isDrawMode;
            canvas.classList.toggle('active', isDrawMode);
            drawBtn.classList.toggle('active', isDrawMode);
            
            if (isDrawMode) {
                this._showToastInDetached(popup, '✏️ Režim kreslení aktivní');
            }
        });

        // Color picker
        colorPicker.addEventListener('change', (e) => {
            drawColor = e.target.value;
        });

        // Clear drawings
        clearBtn.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this._showToastInDetached(popup, '🗑️ Kresby smazány');
        });

        // Drawing events
        const startDraw = (e) => {
            if (!isDrawMode) return;
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            lastX = (e.clientX || e.touches[0].clientX) - rect.left;
            lastY = (e.clientY || e.touches[0].clientY) - rect.top;
        };

        const draw = (e) => {
            if (!isDrawing || !isDrawMode) return;
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches[0].clientX) - rect.left;
            const y = (e.clientY || e.touches[0].clientY) - rect.top;

            ctx.beginPath();
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();

            lastX = x;
            lastY = y;
        };

        const stopDraw = () => {
            isDrawing = false;
        };

        // Mouse events
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDraw);
        canvas.addEventListener('mouseout', stopDraw);

        // Touch events for tablet/mobile
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDraw);
    }

    /**
     * Transformuje data pro detached window
     * @private
     */
    _transformDataForDetached(data) {
        if (!Array.isArray(data)) return [];
        return data.map(item => ({
            time: item.time,
            value: item.value !== undefined ? item.value : undefined,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        })).filter(item => item.time);
    }

    /**
     * Pořídí screenshot grafů v detached window
     * @private
     */
    _takeScreenshotInDetached(popup, mainChart, drawingCanvas) {
        try {
            // Screenshot main chart
            const chartCanvas = mainChart.takeScreenshot();
            
            // Kombinovat s kresbami
            const finalCanvas = popup.document.createElement('canvas');
            finalCanvas.width = chartCanvas.width;
            finalCanvas.height = chartCanvas.height;
            const ctx = finalCanvas.getContext('2d');
            
            // Nejdříve nakreslit graf
            ctx.drawImage(chartCanvas, 0, 0);
            
            // Pak přidat kresby z drawing canvasu (pokud existují)
            if (drawingCanvas && drawingCanvas.width > 0) {
                ctx.drawImage(drawingCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
            }
            
            // Vytvoř temporary link pro download
            finalCanvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const a = popup.document.createElement('a');
                a.href = url;
                a.download = `candleviewer-chart-${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(url);
                
                // Zobraz toast
                this._showToastInDetached(popup, '✅ Screenshot stažen');
            });
            
        } catch (error) {
            console.error('Chyba při pořizování screenshotu:', error);
            this._showToastInDetached(popup, '❌ Chyba při pořizování screenshotu');
        }
    }

    /**
     * Zobrazí toast notifikaci v detached window
     * @private
     */
    _showToastInDetached(popup, message) {
        const toast = popup.document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

export const chartManager = new ChartManager();
