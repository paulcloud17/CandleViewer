/**
 * StateManager.js
 * Zodpovědnost: Správa stavu aplikace
 * - URL parameters pro sdílení
 * - localStorage pro historii
 * - Session state management
 */

export class StateManager {
    constructor() {
        this.storageKey = 'candleviewer_history';
        this.maxHistoryItems = 50;
    }

    /**
     * Uloží analýzu do URL parameters
     * @param {Object} params - Parametry analýzy
     */
    saveToURL(params) {
        const url = new URL(window.location);
        
        // Základní parametry
        if (params.symbol) url.searchParams.set('symbol', params.symbol);
        if (params.startDate) url.searchParams.set('start', params.startDate);
        if (params.endDate) url.searchParams.set('end', params.endDate);
        if (params.initialCapital) url.searchParams.set('capital', params.initialCapital);
        if (params.interval) url.searchParams.set('interval', params.interval);
        if (params.viewStart !== undefined) url.searchParams.set('viewStart', params.viewStart);
        if (params.viewEnd !== undefined) url.searchParams.set('viewEnd', params.viewEnd);

        // Update URL bez reload
        window.history.pushState({}, '', url);
    }

    /**
     * Načte parametry z URL
     * @returns {Object|null} - Parametry nebo null
     */
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        
        const symbol = params.get('symbol');
        if (!symbol) return null;
        const viewStart = params.get('viewStart');
        const viewEnd = params.get('viewEnd');

        return {
            symbol: symbol,
            startDate: params.get('start'),
            endDate: params.get('end'),
            initialCapital: params.get('capital'),
            interval: params.get('interval') || '1d',
            viewStart: viewStart ? parseFloat(viewStart) : undefined,
            viewEnd: viewEnd ? parseFloat(viewEnd) : undefined
        };
    }

    /**
     * Vyčistí URL parameters
     */
    clearURL() {
        const url = new URL(window.location);
        url.search = '';
        window.history.pushState({}, '', url);
    }

    /**
     * Uloží analýzu do historie (localStorage)
     * @param {Object} analysis - Kompletní analýza
     * @param {Array} trades - Pole normalizovaných obchodů k uložení
     * @param {string} note - Volitelná poznámka k analýze
     * @returns {{item: Object, tradesStored: boolean}} - Uložený záznam a indikátor zda byly uloženy obchody
     */
    saveToHistory(analysis, trades = [], note = '') {
        let tradesStored = false;
        
        try {
            const history = this.getHistory();
            const itemId = Date.now();
            
            const historyItem = {
                id: itemId,
                timestamp: new Date().toISOString(),
                symbol: analysis.symbol,
                startDate: analysis.startDate,
                endDate: analysis.endDate,
                initialCapital: analysis.initialCapital,
                interval: analysis.interval,
                note: note || '',
                hasTrades: false, // Bude aktualizováno pokud se podaří uložit trades
                metrics: {
                    totalReturn: analysis.metrics?.performance?.totalReturn,
                    benchmarkReturn: analysis.metrics?.performance?.benchmarkReturn,
                    sharpeRatio: analysis.metrics?.risk?.sharpeRatio,
                    maxDrawdown: analysis.metrics?.risk?.maxDrawdown,
                    winRate: analysis.metrics?.trades?.winRate,
                    totalTrades: analysis.metrics?.trades?.total
                }
            };

            // Přidat na začátek
            history.unshift(historyItem);

            // Omezit velikost historie
            const trimmedHistory = history.slice(0, this.maxHistoryItems);

            localStorage.setItem(this.storageKey, JSON.stringify(trimmedHistory));
            
            // Pokusit se uložit trades zvlášť (kvůli velikosti)
            if (trades && trades.length > 0) {
                tradesStored = this._saveTradesForItem(itemId, trades);
                if (tradesStored) {
                    // Aktualizovat příznak hasTrades
                    historyItem.hasTrades = true;
                    trimmedHistory[0].hasTrades = true;
                    localStorage.setItem(this.storageKey, JSON.stringify(trimmedHistory));
                }
            }
            
            return { item: historyItem, tradesStored };
        } catch (error) {
            console.error('Chyba při ukládání do historie:', error);
            return { item: null, tradesStored: false };
        }
    }

    /**
     * Uloží trades pro konkrétní historickou položku
     * @private
     */
    _saveTradesForItem(itemId, trades) {
        const tradesKey = `${this.storageKey}_trades_${itemId}`;
        try {
            const tradesJson = JSON.stringify(trades);
            localStorage.setItem(tradesKey, tradesJson);
            console.log(`✅ Trades uloženy pro položku ${itemId} (${trades.length} obchodů)`);
            return true;
        } catch (error) {
            // Pravděpodobně překročena kvóta localStorage
            console.warn(`⚠️ Nelze uložit trades pro položku ${itemId}:`, error.message);
            return false;
        }
    }

    /**
     * Načte trades pro konkrétní historickou položku
     * @param {number} itemId - ID položky
     * @returns {Array|null} - Pole obchodů nebo null
     */
    getTradesForItem(itemId) {
        const tradesKey = `${this.storageKey}_trades_${itemId}`;
        try {
            const stored = localStorage.getItem(tradesKey);
            if (stored) {
                const trades = JSON.parse(stored);
                console.log(`📂 Načteno ${trades.length} obchodů pro položku ${itemId}`);
                return trades;
            }
            return null;
        } catch (error) {
            console.error('Chyba při čtení trades z historie:', error);
            return null;
        }
    }

    /**
     * Načte historii analýz
     * @returns {Array} - Pole historických záznamů
     */
    getHistory() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Chyba při čtení historie:', error);
            return [];
        }
    }

    /**
     * Smaže celou historii (včetně všech uložených trades)
     */
    clearHistory() {
        try {
            const history = this.getHistory();
            history.forEach(item => {
                const tradesKey = `${this.storageKey}_trades_${item.id}`;
                localStorage.removeItem(tradesKey);
            });
            
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            console.error('Chyba při mazání historie:', error);
            return false;
        }
    }

    /**
     * Smaže konkrétní záznam z historie (včetně uložených trades)
     * @param {number} id - ID záznamu
     */
    deleteHistoryItem(id) {
        try {
            const history = this.getHistory();
            const filtered = history.filter(item => item.id !== id);
            localStorage.setItem(this.storageKey, JSON.stringify(filtered));
            const tradesKey = `${this.storageKey}_trades_${id}`;
            localStorage.removeItem(tradesKey);
            
            return true;
        } catch (error) {
            console.error('Chyba při mazání záznamu:', error);
            return false;
        }
    }

    /**
     * Aktualizuje konkrétní záznam v historii
     * @param {number} id - ID záznamu
     * @param {Object} updates - Objekt s aktualizacemi (např. {note: 'nová poznámka'})
     * @returns {boolean} - Úspěch operace
     */
    updateHistoryItem(id, updates) {
        try {
            const history = this.getHistory();
            const index = history.findIndex(item => item.id === id);
            
            if (index === -1) {
                console.warn(`Záznam s ID ${id} nenalezen`);
                return false;
            }
            
            // Aktualizovat záznam
            history[index] = { ...history[index], ...updates };
            
            localStorage.setItem(this.storageKey, JSON.stringify(history));
            return true;
        } catch (error) {
            console.error('Chyba při aktualizaci záznamu:', error);
            return false;
        }
    }

    /**
     * Najde záznam v historii podle ID
     * @param {number} id - ID záznamu
     * @returns {Object|null}
     */
    getHistoryItem(id) {
        const history = this.getHistory();
        return history.find(item => item.id === id) || null;
    }

    /**
     * Exportuje historii jako JSON soubor
     */
    exportHistory() {
        const history = this.getHistory();
        
        const dataStr = JSON.stringify(history, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `candleviewer_history_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    /**
     * Importuje historii z JSON souboru
     * @param {File} file - JSON soubor
     * @returns {Promise<boolean>}
     */
    async importHistory(file) {
        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            
            if (!Array.isArray(imported)) {
                throw new Error('Soubor neobsahuje platné pole záznamů');
            }

            // Sloučit s existující historií
            const current = this.getHistory();
            const merged = [...imported, ...current];
            
            // Odstranit duplicity podle timestamp
            const unique = merged.filter((item, index, self) =>
                index === self.findIndex(t => t.timestamp === item.timestamp)
            );

            // Seřadit podle timestamp (nejnovější první)
            unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Omezit velikost
            const trimmed = unique.slice(0, this.maxHistoryItems);

            localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
            
            return true;
        } catch (error) {
            console.error('Chyba při importu historie:', error);
            throw error;
        }
    }

    /**
     * Kontroluje, zda je localStorage dostupný
     * @returns {boolean}
     */
    isStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Vrátí statistiky o historii
     * @returns {Object}
     */
    getHistoryStats() {
        const history = this.getHistory();
        
        if (history.length === 0) {
            return {
                totalAnalyses: 0,
                uniqueSymbols: 0,
                oldestAnalysis: null,
                newestAnalysis: null
            };
        }

        const symbols = new Set(history.map(h => h.symbol));
        
        return {
            totalAnalyses: history.length,
            uniqueSymbols: symbols.size,
            oldestAnalysis: history[history.length - 1].timestamp,
            newestAnalysis: history[0].timestamp,
            averageReturn: this._calculateAverage(
                history.map(h => h.metrics?.totalReturn).filter(Boolean)
            )
        };
    }

    _calculateAverage(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }
}

// Singleton instance
export const stateManager = new StateManager();
