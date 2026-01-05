/**
 * dataTransform.js
 * Utility pro transformaci dat mezi různými formáty
 */

/**
 * Transformuje OHLCV data z backendu na formát pro Lightweight Charts
 * @param {Array} ohlcvData - Raw OHLCV data z DataFetcher
 * @returns {Array} - Candlestick data pro Lightweight Charts
 */
export function transformOHLCVForChart(ohlcvData) {
    if (!Array.isArray(ohlcvData) || ohlcvData.length === 0) {
        return [];
    }

    const candlesticks = [];

    for (const candle of ohlcvData) {
        // Candlestick data
        candlesticks.push({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        });
    }

    return candlesticks;
}

/**
 * Transformuje equity křivku na formát pro Lightweight Charts
 * @param {Array} equity - Equity data ze StatsEngine
 * @returns {Array} - [{time: string, value: number}]
 */
export function transformEquityForChart(equity) {
    if (!Array.isArray(equity) || equity.length === 0) {
        return [];
    }

    return equity.map(point => ({
        time: point.time,
        value: point.value
    }));
}

/**
 * Vytvoří trade markers pro Lightweight Charts
 * @param {Array} trades - Pole trades z BacktestProcessor
 * @returns {Array}
 */
export function createTradeMarkers(trades) {
    if (!Array.isArray(trades) || trades.length === 0) {
        return [];
    }

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
 * Najde časový rozsah dat
 * @param {Array} ohlcvData - OHLCV data
 * @returns {Object} - {start: string, end: string}
 */
export function getTimeRange(ohlcvData) {
    if (!Array.isArray(ohlcvData) || ohlcvData.length === 0) {
        return { start: null, end: null };
    }

    return {
        start: ohlcvData[0].time,
        end: ohlcvData[ohlcvData.length - 1].time
    };
}

/**
 * Filtruje data podle časového rozsahu
 * @param {Array} data - Data s time property
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @returns {Array}
 */
export function filterByTimeRange(data, startTime, endTime) {
    if (!Array.isArray(data)) return [];
    
    return data.filter(item => {
        return item.time >= startTime && item.time <= endTime;
    });
}
