/**
 * StatsEngine.js
 * Zodpovědnost: Výpočet finančních metrik a benchmarků (100% frontend!)
 * - Buy & Hold benchmark (místo backendu)
 * - Dynamická Equity křivka z trades + initial capital
 * - Sharpe Ratio, Sortino Ratio, Max Drawdown
 * - Profit Factor, Win Rate, Recovery Factor
 */

export class StatsEngine {
    constructor() {
        this.riskFreeRate = 0.02; // 2% anualizovaná bezriziková míra
        this.tradingDaysPerYear = 252; // Pro anualizaci
    }

    /**
     * Vypočítá Buy & Hold benchmark equity křivku
     * @param {Array} ohlcvData - OHLCV data z DataFetcher
     * @param {number} initialCapital - Počáteční kapitál
     * @returns {Array} - [{time: string, value: number, return: number}]
     */
    calculateBuyAndHoldEquity(ohlcvData, initialCapital) {
        if (!ohlcvData || ohlcvData.length === 0) {
            throw new Error('OHLCV data jsou prázdná');
        }

        const firstPrice = ohlcvData[0].close;
        const equity = [];

        for (const candle of ohlcvData) {
            const priceReturn = (candle.close / firstPrice);
            const equityValue = initialCapital * priceReturn;
            const returnPercent = (priceReturn - 1) * 100;

            equity.push({
                time: candle.time,
                value: equityValue,
                return: returnPercent
            });
        }

        return equity;
    }

    /**
     * Vypočítá strategii equity křivku z trades + OHLCV data
     * 
     * @param {Array} trades - Pole obchodů z BacktestProcessor (must have exitTimestamp)
     * @param {Array} ohlcvData - OHLCV data pro kompletní časovou osu
     * @param {number} initialCapital - Počáteční kapitál
     * @returns {Array} - [{time: number|string, value: number, drawdown: number}]
     */
    calculateStrategyEquity(trades, ohlcvData, initialCapital) {
        if (!trades || trades.length === 0) {
            // Pokud nejsou žádné trades, equity = initial capital (flat line)
            return ohlcvData.map(candle => ({
                time: candle.time,
                value: initialCapital,
                drawdown: 0
            }));
        }

        const sortedTrades = [...trades].sort((a, b) => {
            return a.exitTimestamp - b.exitTimestamp;
        });

        const pnlEvents = [];
        let cumulativePnL = 0;

        for (const trade of sortedTrades) {
            cumulativePnL += trade.pnl;
            pnlEvents.push({
                timestamp: trade.exitTimestamp,
                cumulativePnL: cumulativePnL
            });
        }

        const equity = [];
        let currentPnL = 0;
        let peak = initialCapital;
        let eventIndex = 0;

        for (const candle of ohlcvData) {
            const candleTimestamp = this._getCandleTimestamp(candle.time);

            while (eventIndex < pnlEvents.length && 
                   pnlEvents[eventIndex].timestamp <= candleTimestamp) {
                currentPnL = pnlEvents[eventIndex].cumulativePnL;
                eventIndex++;
            }

            const equityValue = initialCapital + currentPnL;

            if (equityValue > peak) {
                peak = equityValue;
            }

            const drawdown = peak > 0 ? ((peak - equityValue) / peak) * 100 : 0;

            equity.push({
                time: candle.time,
                value: equityValue,
                drawdown: drawdown
            });
        }

        return equity;
    }

    /**
    * Získá Unix timestamp z candle time (string nebo number)
     * @param {string|number} time
     * @returns {number}
     */
    _getCandleTimestamp(time) {
        if (typeof time === 'number') {
            return time;
        }
        
        if (typeof time === 'string') {
            const date = new Date(time + 'T00:00:00Z');
            return Math.floor(date.getTime() / 1000);
        }
        
        console.warn('Unknown time format:', time);
        return 0;
    }

    /**
     * Vypočítá returns (denní změny) z equity křivky
     * @param {Array} equity - Equity křivka
     * @returns {Array<number>} - Pole denních returns
     */
    calculateReturns(equity) {
        if (equity.length < 2) return [];

        const returns = [];
        for (let i = 1; i < equity.length; i++) {
            const prevValue = equity[i - 1].value;
            const currValue = equity[i].value;
            
            if (prevValue > 0) {
                returns.push((currValue - prevValue) / prevValue);
            }
        }

        return returns;
    }

    /**
     * Sharpe Ratio - (průměrný return - risk free) / volatilita
     * @param {Array} equity - Equity křivka
     * @returns {number} - Anualizovaný Sharpe Ratio
     */
    /**
     * Sharpe Ratio - (průměrný return - risk-free) / std dev returnů
     * @param {Array} equity - Equity křivka
     * @returns {number} - Anualizovaný Sharpe Ratio
     */
    calculateSharpeRatio(equity) {
        const returns = this.calculateReturns(equity);
        
        if (returns.length === 0) {
            console.warn('StatsEngine: Cannot calculate Sharpe Ratio - no returns data');
            return 0;
        }

        const mean = this._mean(returns);
        const stdDev = this._standardDeviation(returns);

        if (stdDev === 0 || !isFinite(stdDev)) {
            if (mean > 0) {
                console.warn('StatsEngine: Zero volatility with positive returns - returning high Sharpe');
                return 999;
            }
            return 0;
        }

        const dailyRiskFree = this.riskFreeRate / this.tradingDaysPerYear;
        const sharpe = (mean - dailyRiskFree) / stdDev;

        // Anualizace with bounds check
        const annualized = sharpe * Math.sqrt(this.tradingDaysPerYear);
        return isFinite(annualized) ? annualized : 0;
    }

    /**
     * Sortino Ratio - (průměrný return - target) / downside deviation
     * @param {Array} equity - Equity křivka
     * @param {number} targetReturn - Cílový return (default 0)
     * @returns {number} - Anualizovaný Sortino Ratio
     */
    /**
     * Sortino Ratio - (průměrný return - target) / downside deviation
     * @param {Array} equity - Equity křivka
     * @param {number} targetReturn - Cílový return (default 0)
     * @returns {number} - Anualizovaný Sortino Ratio
     */
    calculateSortinoRatio(equity, targetReturn = 0) {
        const returns = this.calculateReturns(equity);
        
        if (returns.length === 0) {
            console.warn('StatsEngine: Cannot calculate Sortino Ratio - no returns data');
            return 0;
        }

        const mean = this._mean(returns);
        
        // Pouze negativní returns (downside)
        const downsideReturns = returns.filter(r => r < targetReturn);
        
        if (downsideReturns.length === 0) {
            console.info('StatsEngine: No downside returns - exceptional Sortino');
            return 999; // Žádné ztráty = extrémně vysoký Sortino
        }

        const downsideDeviation = this._standardDeviation(
            downsideReturns.map(r => r - targetReturn)
        );

        if (downsideDeviation === 0 || !isFinite(downsideDeviation)) {
            console.warn('StatsEngine: Zero downside deviation - returning 0');
            return 0;
        }

        const sortino = (mean - targetReturn) / downsideDeviation;
        const annualized = sortino * Math.sqrt(this.tradingDaysPerYear);
        return isFinite(annualized) ? annualized : 0;
    }

    /**
     * Maximum Drawdown - největší propad od peak
     * @param {Array} equity - Equity křivka
     * @returns {number} - MDD v procentech (záporné číslo)
     */
    calculateMaxDrawdown(equity) {
        if (equity.length === 0) return 0;

        let maxDD = 0;
        let peak = equity[0].value;

        for (const point of equity) {
            if (point.value > peak) {
                peak = point.value;
            }

            const drawdown = peak > 0 ? ((peak - point.value) / peak) : 0;
            
            if (drawdown > maxDD) {
                maxDD = drawdown;
            }
        }

        return -maxDD * 100; // Vrátit jako záporné procento
    }

    /**
     * Profit Factor - suma zisků / suma ztrát
     * @param {Array} trades - Pole obchodů
     * @returns {number}
     */
    calculateProfitFactor(trades) {
        if (!trades || trades.length === 0) {
            console.warn('StatsEngine: Cannot calculate Profit Factor - no trades');
            return 0;
        }

        let totalWins = 0;
        let totalLosses = 0;

        for (const trade of trades) {
            const pnl = parseFloat(trade.pnl);
            if (!isFinite(pnl)) continue;
            
            if (pnl > 0) {
                totalWins += pnl;
            } else if (pnl < 0) {
                totalLosses += Math.abs(pnl);
            }
        }

        if (totalLosses === 0 || !isFinite(totalLosses)) {
            if (totalWins > 0) {
                console.info('StatsEngine: No losses with wins - exceptional Profit Factor');
                return 999; // Žádné ztráty = extrémně vysoký PF
            }
            return 0;
        }

        const pf = totalWins / totalLosses;
        return isFinite(pf) ? pf : 0;
    }

    /**
     * Win Rate - procento ziskových obchodů
     * @param {Array} trades - Pole obchodů
     * @returns {number} - Procento (0-100)
     */
    calculateWinRate(trades) {
        if (!trades || trades.length === 0) return 0;

        const winningTrades = trades.filter(t => t.pnl > 0).length;
        return (winningTrades / trades.length) * 100;
    }

    /**
     * Average Profit per Trade
     * @param {Array} trades - Pole obchodů
     * @returns {number}
     */
    calculateAvgProfit(trades) {
        if (!trades || trades.length === 0) return 0;

        const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        return totalPnL / trades.length;
    }

    /**
     * Recovery Factor - total return / max drawdown
     * @param {number} totalReturn - Celkový return v %
     * @param {number} maxDrawdown - MDD v % (záporné)
     * @returns {number}
     */
    calculateRecoveryFactor(totalReturn, maxDrawdown) {
        if (maxDrawdown === 0) return 0;
        return totalReturn / Math.abs(maxDrawdown);
    }

    /**
     * Kompletní analýza strategie
     * @param {Object} params
     * @param {Array} params.trades - Obchody
     * @param {Array} params.ohlcvData - OHLCV data
     * @param {number} params.initialCapital - Počáteční kapitál
     * @returns {Object} - Kompletní metriky
     */
    analyzeStrategy(params) {
        const { trades, ohlcvData, initialCapital } = params;

        // 1. Vypočítat equity křivky
        const strategyEquity = this.calculateStrategyEquity(
            trades, 
            ohlcvData, 
            initialCapital
        );

        const benchmarkEquity = this.calculateBuyAndHoldEquity(
            ohlcvData, 
            initialCapital
        );

        // 2. Vypočítat returns
        const finalStrategyValue = strategyEquity[strategyEquity.length - 1].value;
        const finalBenchmarkValue = benchmarkEquity[benchmarkEquity.length - 1].value;

        const strategyReturn = ((finalStrategyValue - initialCapital) / initialCapital) * 100;
        const benchmarkReturn = ((finalBenchmarkValue - initialCapital) / initialCapital) * 100;

        // 3. Risk metriky
        const sharpe = this.calculateSharpeRatio(strategyEquity);
        const sortino = this.calculateSortinoRatio(strategyEquity);
        const maxDrawdown = this.calculateMaxDrawdown(strategyEquity);

        // 4. Trade metriky
        const profitFactor = this.calculateProfitFactor(trades);
        const winRate = this.calculateWinRate(trades);
        const avgProfit = this.calculateAvgProfit(trades);
        const recoveryFactor = this.calculateRecoveryFactor(strategyReturn, maxDrawdown);

        return {
            equity: {
                strategy: strategyEquity,
                benchmark: benchmarkEquity
            },
            performance: {
                totalReturn: strategyReturn,
                benchmarkReturn: benchmarkReturn,
                excessReturn: strategyReturn - benchmarkReturn
            },
            risk: {
                sharpeRatio: sharpe,
                sortinoRatio: sortino,
                maxDrawdown: maxDrawdown,
                recoveryFactor: recoveryFactor
            },
            trades: {
                total: trades.length,
                winRate: winRate,
                profitFactor: profitFactor,
                avgProfit: avgProfit,
                totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0)
            }
        };
    }

    // ========== Helper Methods ==========

    _mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }

    _standardDeviation(arr) {
        if (arr.length === 0) return 0;
        
        const mean = this._mean(arr);
        const squaredDiffs = arr.map(val => Math.pow(val - mean, 2));
        const variance = this._mean(squaredDiffs);
        
        return Math.sqrt(variance);
    }
}

// Singleton instance
export const statsEngine = new StatsEngine();
