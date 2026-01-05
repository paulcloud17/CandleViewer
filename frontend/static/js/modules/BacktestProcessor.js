/**
 * BacktestProcessor.js
 * Zodpovědnost: Zpracování backtest logů (CSV/JSON)
 * - Parse CSV a JSON formátů
 * - Validace struktury trades
 * - Výpočet P&L pokud není poskytnut
 * - Normalizace dat pro StatsEngine
 */

export class BacktestProcessor {
    constructor() {
        this.requiredFields = ['entryTime', 'entryPrice', 'exitTime', 'exitPrice'];
    }

    /**
     * Hlavní metoda - detekuje formát a zpracuje soubor
     * @param {File} file
     * @returns {Promise<Array>}
     */
    async processFile(file) {
        const fileName = file.name.toLowerCase();
        const fileContent = await this._readFile(file);

        if (fileName.endsWith('.json')) {
            return this.parseJSON(fileContent);
        } else if (fileName.endsWith('.csv')) {
            return this.parseCSV(fileContent);
        } else {
            throw new Error('Nepodporovaný formát souboru. Použijte .csv nebo .json');
        }
    }

    /**
     * Parse JSON formát
     * Podporuje dva formáty:
     * 1. {"trades": [{...}, {...}]}
     * 2. [{...}, {...}] - přímo array
     * 
     * @param {string} jsonString
     * @returns {Array}
     */
    parseJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            
            let tradesArray = Array.isArray(parsed) ? parsed : parsed.trades;
            
            if (!Array.isArray(tradesArray)) {
                throw new Error('JSON musí obsahovat pole "trades" nebo být přímo array');
            }

            if (tradesArray.length === 0) {
                throw new Error('Soubor neobsahuje žádné obchody');
            }

            return tradesArray.map((trade, index) => 
                this._normalizeTrade(trade, index)
            );

        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('Neplatný JSON formát: ' + error.message);
            }
            throw error;
        }
    }

    /**
     * Parse CSV formát
     * Očekává header: entryTime,entryPrice,exitTime,exitPrice,shares,type
     * 
     * @param {string} csvString
     * @returns {Array}
     */
    parseCSV(csvString) {
        const lines = csvString.trim().split('\n');
        
        if (lines.length < 2) {
            throw new Error('CSV soubor je prázdný nebo neobsahuje header');
        }

        const header = lines[0].split(',').map(h => h.trim());
        
        const hasRequiredFields = this.requiredFields.every(field => 
            header.includes(field)
        );

        if (!hasRequiredFields) {
            throw new Error(
                `CSV musí obsahovat sloupce: ${this.requiredFields.join(', ')}`
            );
        }

        const trades = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim());
            
            if (values.length !== header.length) {
                console.warn(`Řádek ${i + 1}: Nesprávný počet sloupců, přeskakuji`);
                continue;
            }

            // Vytvoř objekt z CSV řádku
            const trade = {};
            header.forEach((field, idx) => {
                trade[field] = values[idx];
            });

            trades.push(this._normalizeTrade(trade, i - 1));
        }

        if (trades.length === 0) {
            throw new Error('Nepodařilo se načíst žádné platné obchody z CSV');
        }

        return trades;
    }

    /**
     * Normalizuje trade objekt do standardního formátu
     * Vypočítá P&L pokud není poskytnut
     * 
     * @param {Object} trade
     * @param {number} index
     * @returns {Object}
     */
    _normalizeTrade(trade, index) {
        // Validace požadovaných polí
        for (const field of this.requiredFields) {
            if (!trade.hasOwnProperty(field)) {
                throw new Error(
                    `Trade ${index + 1}: Chybí povinné pole "${field}"`
                );
            }
        }

        // Parse hodnoty
        const entryPrice = parseFloat(trade.entryPrice);
        const exitPrice = parseFloat(trade.exitPrice);
        const shares = parseFloat(trade.shares || 1);
        const type = (trade.type || 'long').toLowerCase();

        // Validace číselných hodnot
        if (isNaN(entryPrice) || isNaN(exitPrice) || isNaN(shares)) {
            throw new Error(
                `Trade ${index + 1}: Neplatné číselné hodnoty (entry/exit/shares)`
            );
        }

        if (shares <= 0) {
            throw new Error(`Trade ${index + 1}: Shares musí být > 0`);
        }

        // Validace dat
        const entryDate = new Date(trade.entryTime);
        const exitDate = new Date(trade.exitTime);

        if (isNaN(entryDate.getTime()) || isNaN(exitDate.getTime())) {
            throw new Error(
                `Trade ${index + 1}: Neplatný formát data (použijte YYYY-MM-DD)`
            );
        }

        if (exitDate < entryDate) {
            throw new Error(
                `Trade ${index + 1}: Exit datum nesmí být před Entry datem`
            );
        }

        // Výpočet P&L
        let pnl;
        
        if (trade.pnl !== undefined && trade.pnl !== null && trade.pnl !== '') {
            pnl = parseFloat(trade.pnl);
        } else {
            // Vypočítat P&L podle typu pozice
            if (type === 'long') {
                pnl = (exitPrice - entryPrice) * shares;
            } else if (type === 'short') {
                pnl = (entryPrice - exitPrice) * shares;
            } else {
                throw new Error(
                    `Trade ${index + 1}: Neplatný typ "${type}" (použijte "long" nebo "short")`
                );
            }
        }

        // Výpočet dalších metrik
        const pnlPercent = type === 'long' 
            ? ((exitPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - exitPrice) / entryPrice) * 100;

        const duration = Math.ceil(
            (exitDate - entryDate) / (1000 * 60 * 60 * 24)
        );

        const entryTimestamp = trade.entryTimestamp 
            ? parseInt(trade.entryTimestamp)
            : Math.floor(entryDate.getTime() / 1000);
        
        const exitTimestamp = trade.exitTimestamp 
            ? parseInt(trade.exitTimestamp)
            : Math.floor(exitDate.getTime() / 1000);

        // Vrátit normalizovaný trade
        return {
            id: index + 1,
            type: type,
            entryTime: trade.entryTime,
            entryTimeNormalized: this._formatDate(entryDate),
            entryTimestamp: entryTimestamp,
            entryPrice: entryPrice,
            exitTime: trade.exitTime,
            exitTimeNormalized: this._formatDate(exitDate),
            exitTimestamp: exitTimestamp,
            exitPrice: exitPrice,
            shares: shares,
            pnl: pnl,
            pnlPercent: pnlPercent,
            duration: duration
        };
    }

    /**
     * Přečte obsah souboru jako text
     * @param {File} file
     * @returns {Promise<string>}
     */
    _readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Chyba při čtení souboru'));
            
            reader.readAsText(file);
        });
    }

    /**
     * Formátuje datum do YYYY-MM-DD
     * @param {Date} date
     * @returns {string}
     */
    _formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * @param {Object} trade
     * @param {Array} candles
     * @param {string} timeframe
     * @returns {Object|null}
     */
    matchTradeToCandle(trade, candles, timeframe, isEntry = true) {
        if (!candles || candles.length === 0) return null;

        const isDailyOrWeekly = timeframe === '1d' || timeframe === '1wk';
        const tradeTime = isEntry ? trade.entryTime : trade.exitTime;
        const tradeTimeNormalized = isEntry ? trade.entryTimeNormalized : trade.exitTimeNormalized;
        const tradeTimestamp = isEntry ? trade.entryTimestamp : trade.exitTimestamp;

        if (isDailyOrWeekly) {
            return this._matchByDate(tradeTimeNormalized, candles);
        } else {
            return this._matchByTimestamp(tradeTimestamp, candles);
        }
    }

    /**
     * @param {string} tradeDateString
     * @param {Array} candles
     * @returns {Object|null}
     */
    _matchByDate(tradeDateString, candles) {
        const match = candles.find(candle => {
            const candleDate = this._extractDateString(candle.time);
            return candleDate === tradeDateString;
        });

        return match || null;
    }

    /**
     * @param {number} tradeTimestamp
     * @param {Array} candles
     * @returns {Object|null}
     */
    _matchByTimestamp(tradeTimestamp, candles) {
        const TOLERANCE_SECONDS = 300;
        
        let bestMatch = null;
        let smallestDiff = Infinity;

        for (const candle of candles) {
            const candleTimestamp = this._extractTimestamp(candle.time);
            
            if (candleTimestamp === null) continue;

            const diff = tradeTimestamp - candleTimestamp;

            if (diff >= 0 && diff <= TOLERANCE_SECONDS) {
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    bestMatch = candle;
                }
            }
        }

        return bestMatch;
    }

    /**
     * @param {*} time
     * @returns {string|null}
     */
    _extractDateString(time) {
        if (typeof time === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
                return time;
            }
            const date = new Date(time);
            if (!isNaN(date.getTime())) {
                return this._formatDate(date);
            }
        } else if (typeof time === 'number') {
            const timestamp = time > 10000000000 ? time : time * 1000;
            const date = new Date(timestamp);
            return this._formatDate(date);
        } else if (time && typeof time === 'object' && 'year' in time) {
            const year = time.year;
            const month = String(time.month || 1).padStart(2, '0');
            const day = String(time.day || 1).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        return null;
    }

    /**
     * @param {*} time
     * @returns {number|null}
     */
    _extractTimestamp(time) {
        if (typeof time === 'number') {
            return time > 10000000000 ? Math.floor(time / 1000) : time;
        } else if (typeof time === 'string') {
            const date = new Date(time);
            if (!isNaN(date.getTime())) {
                return Math.floor(date.getTime() / 1000);
            }
        } else if (time && typeof time === 'object' && 'year' in time) {
            const date = new Date(Date.UTC(
                time.year,
                (time.month || 1) - 1,
                time.day || 1,
                time.hour || 0,
                time.minute || 0,
                time.second || 0
            ));
            return Math.floor(date.getTime() / 1000);
        }

        return null;
    }

    /**
     * @returns {string}
     */
    generateCSVTemplate() {
        return `entryTime,entryPrice,exitTime,exitPrice,shares,type
2023-01-05,150.50,2023-01-10,155.20,100,long
2023-02-01,148.00,2023-02-05,146.50,100,long
2023-03-10,152.30,2023-03-15,158.90,50,long
2023-04-20,160.00,2023-04-22,157.50,100,short`;
    }

    /**
     * Vytvoří ukázkový JSON template
     * @returns {Object}
     */
    generateJSONTemplate() {
        return {
            trades: [
                {
                    entryTime: "2023-01-05",
                    entryPrice: 150.50,
                    exitTime: "2023-01-10",
                    exitPrice: 155.20,
                    shares: 100,
                    type: "long"
                },
                {
                    entryTime: "2023-02-01",
                    entryPrice: 148.00,
                    exitTime: "2023-02-05",
                    exitPrice: 146.50,
                    shares: 100,
                    type: "long"
                }
            ]
        };
    }
}

export const backtestProcessor = new BacktestProcessor();
