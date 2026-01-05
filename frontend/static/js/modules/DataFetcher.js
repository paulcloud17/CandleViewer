/**
 * DataFetcher.js
 * Zodpovědnost: AJAX komunikace s Flask backend API
 * - Stahování OHLCV dat z yfinance
 * - Validace symbolů
 * - Error handling a retry logika
 */

const API_BASE_URL = window.location.origin;

export class DataFetcher {
    constructor() {
        this.abortController = null;
    }

    /**
     * Validuje symbol před stažením dat
     * @param {string} symbol - Ticker symbol (např. "AAPL")
     * @returns {Promise<{valid: boolean, name?: string, error?: string}>}
     */
    async validateSymbol(symbol) {
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/validate-symbol?symbol=${encodeURIComponent(symbol)}`
            );
            
            const data = await response.json();
            
            if (!response.ok) {
                return {
                    valid: false,
                    error: data.error || 'Neplatný symbol'
                };
            }
            
            return data;
        } catch (error) {
            console.error('Symbol validation error:', error);
            return {
                valid: false,
                error: 'Chyba při validaci symbolu'
            };
        }
    }

    /**
     * Stáhne historická OHLCV data z backendu
     * @param {Object} params - Parametry požadavku
     * @param {string} params.symbol - Ticker symbol
     * @param {string} params.startDate - Datum začátku (YYYY-MM-DD)
     * @param {string} params.endDate - Datum konce (YYYY-MM-DD)
     * @param {string} params.interval - Časový interval (1d, 1h, 30m, ...)
     * @param {Function} onProgress - Callback pro progress updates
     * @returns {Promise<{symbol: string, interval: string, data: Array}>}
     */
    async fetchMarketData(params, onProgress = null) {
        // Zrušit předchozí request pokud běží
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.abortController = new AbortController();
        
        try {
            if (onProgress) {
                onProgress('Odesílám požadavek na server...');
            }
            
            const response = await fetch(`${API_BASE_URL}/api/market-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    symbol: params.symbol.toUpperCase(),
                    startDate: params.startDate,
                    endDate: params.endDate,
                    interval: params.interval || '1d'
                }),
                signal: this.abortController.signal
            });
            
            if (onProgress) {
                onProgress('Zpracovávám odpověď...');
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Chyba při stahování dat');
            }
            
            // Validace dat
            if (!data.data || data.data.length === 0) {
                throw new Error('Backend vrátil prázdná data');
            }
            
            // Validace struktury OHLCV
            const firstCandle = data.data[0];
            const requiredFields = ['time', 'open', 'high', 'low', 'close', 'volume'];
            const hasAllFields = requiredFields.every(field => 
                firstCandle.hasOwnProperty(field)
            );
            
            if (!hasAllFields) {
                throw new Error('Neplatná struktura OHLCV dat');
            }
            
            if (onProgress) {
                onProgress(`Staženo ${data.dataPoints} svíček`);
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Požadavek byl zrušen');
            }
            
            console.error('Market data fetch error:', error);
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Health check API
     * @returns {Promise<{status: string, timestamp: string}>}
     */
    async healthCheck() {
        try {
            const response = await fetch(`${API_BASE_URL}/health`);
            return await response.json();
        } catch (error) {
            console.error('Health check failed:', error);
            throw new Error('Backend není dostupný');
        }
    }

    /**
     * Zruší probíhající request
     */
    cancelRequest() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

// Singleton instance
export const dataFetcher = new DataFetcher();
