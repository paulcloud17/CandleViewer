
function $(id) {
    return document.getElementById(id);
}

const elements = {
    form: $('analysisForm'),
    fileInput: $('tradesFile'),
    mainChart: $('mainChart'),
    perfChart: $('perfChart'),
    historyList: $('historyList'),

    stats: {
        totalReturn: $('statTotalReturn'),
        benchmark: $('statBenchmark'),
        sharpe: $('statSharpe'),
        mdd: $('statMdd'),
        winRate: $('statWinRate'),
        profitFactor: $('statProfitFactor'),
        sortino: $('statSortino'),
        recovery: $('statRecovery'),
        numberOfTrades: $('statNumberOfTrades'),
        finalCapital: $('statFinalCapital'),
        avgProfitPerTrade: $('statAvgProfitPerTrade')
    }
};

let mainChart = null, perfChart = null;

        // NAČTENÍ PARAMETRŮ Z URL A INICIALIZACE
window.addEventListener('DOMContentLoaded', () => {

    const params = new URLSearchParams(window.location.search);

    const urlSymbol = params.get('symbol');
    if (urlSymbol) {
        document.getElementById('symbol').value = urlSymbol;
    }

    const urlStart = params.get('start');
    if (urlStart) {
        document.getElementById('startDate').value = urlStart;
    }

    const urlEnd = params.get('end');
    if (urlEnd) {
        document.getElementById('endDate').value = urlEnd;
    }

    loadHistory();

    const analysisId = params.get('id');
    if (analysisId) {
        loadAnalysisFromHistory(analysisId);
    }
});

            // ODESLÁNÍ FORMULÁŘE A SPUŠTĚNÍ ANALÝZY
elements.form.addEventListener('submit', async (event) => {

    event.preventDefault();

    try {
        const symbol = document.getElementById('symbol').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const capital = Number(document.getElementById('capital').value);

        const formData = {
            symbol: symbol,
            startDate: startDate,
            endDate: endDate,
            capital: capital
        };

        const marketData = await fetchMarketData(formData);
        const tradesFile = document.getElementById('tradesFile').files[0];
        const tradeData = await parseTradeFile(tradesFile);

        window.currentTrades = tradeData;
        window.currentMarketData = marketData;

        const stats = calculateStatistics(marketData, tradeData, capital);

        updateDashboard(stats);
        renderCharts(marketData, tradeData, stats.equityCurve, stats.benchmarkCurve);
        updateURL(formData);
        saveToHistory(formData, stats);

    } catch (error) {
        alert("Nastala chyba při analýze: " + error.message);
    }
});

            // NAČTENÍ TRŽNÍCH DAT ZE SERVERU
async function fetchMarketData(params) {
    const odpoved = await fetch('/api/data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    });
    if (odpoved.ok === false) {
        throw new Error("Nepodařilo se stáhnout data ze serveru.");
    }
    const data = await odpoved.json();
    return data;
}

            // PARSOVÁNÍ SOUBORU S OBCHODY
function parseTradeFile(file) {

    return new Promise(function(resolve, reject) {
        const fileReader = new FileReader();

        fileReader.onload = function(event) {
            try {
                const fileContent = event.target.result;
                const data = JSON.parse(fileContent);

                if (data.trades) {
                    resolve(data.trades);
                } else {
                    resolve(data);
                }
            } catch (error) {
                reject(new Error("File format is invalid. Please upload a correct JSON file."));
            }
        };
        fileReader.onerror = function() {
            reject(new Error("Failed to read the file from disk."));
        };
        fileReader.readAsText(file);
    });
}

            // VÝPOČET STATISTIK
function calculateStatistics(marketPrices, trades, initialCapital) {
    function getDateStr(date) {
        if (date instanceof Date) {
            return date.toISOString().slice(0, 10);
        }
        const str = String(date);
        if (str.length >= 10) {
            return str.slice(0, 10);
        }
        return str;
    }

    const startTime = getDateStr(marketPrices[0] ? marketPrices[0].time : undefined);
    const endTime = getDateStr(marketPrices[marketPrices.length - 1] ? marketPrices[marketPrices.length - 1].time : undefined);

    const filteredTrades = [];
    for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        const exitDate = getDateStr(trade.exitTime);
        if (exitDate >= startTime && exitDate <= endTime) {
            filteredTrades.push(trade);
        }
    }

    let capital = initialCapital;
    const equityCurve = [];
    const equityPeaks = [];

    for (let i = 0; i < marketPrices.length; i++) {
        const day = marketPrices[i];
        const dayStr = getDateStr(day.time);

        for (let j = 0; j < filteredTrades.length; j++) {
            const trade = filteredTrades[j];
            if (getDateStr(trade.exitTime) === dayStr) {
                const shares = trade.shares || 1;
                capital = capital + (trade.exitPrice - trade.entryPrice) * shares;
            }
        }

        const equityPct = ((capital - initialCapital) / initialCapital) * 100;
        equityCurve.push({ time: day.time, value: equityPct });
        equityPeaks.push(capital);
    }

    const totalReturn = ((capital - initialCapital) / initialCapital) * 100;

    const lastMarket = marketPrices.length ? marketPrices[marketPrices.length - 1] : null;
    const benchmarkReturn = lastMarket && lastMarket.benchmark_pct ? lastMarket.benchmark_pct : 0;

    const benchmarkCurve = [];
    for (let i = 0; i < marketPrices.length; i++) {
        benchmarkCurve.push({
            time: marketPrices[i].time,
            value: marketPrices[i].benchmark_pct
        });
    }

    let maxDrawdown = 0;
    let peak = equityPeaks.length ? equityPeaks[0] : 0;
    let maxDrawdownAbs = 0;

    for (let i = 0; i < equityPeaks.length; i++) {
        const eq = equityPeaks[i];
        if (eq > peak) {
            peak = eq;
        }
        if (peak !== 0) {
            const dd = ((eq - peak) / peak) * 100;
            if (dd < maxDrawdown) {
                maxDrawdown = dd;
            }
        }
        const ddAbs = peak - eq;
        if (ddAbs > maxDrawdownAbs) {
            maxDrawdownAbs = ddAbs;
        }
    }

    const dailyReturns = [];
    for (let i = 1; i < equityPeaks.length; i++) {
        const prev = equityPeaks[i - 1];
        const curr = equityPeaks[i];
        if (prev !== 0) {
            dailyReturns.push(((curr - prev) / prev) * 100);
        } else {
            dailyReturns.push(0);
        }
    }

    let avgReturn = 0;
    if (dailyReturns.length > 0) {
        let sum = 0;
        for (let i = 0; i < dailyReturns.length; i++) {
            sum += dailyReturns[i];
        }
        avgReturn = sum / dailyReturns.length;
    }

    let variance = 0;
    if (dailyReturns.length > 0) {
        let sumSq = 0;
        for (let i = 0; i < dailyReturns.length; i++) {
            const diff = dailyReturns[i] - avgReturn;
            sumSq += diff * diff;
        }
        variance = sumSq / dailyReturns.length;
    }

    let annualizedSharpe = 0;
    if (variance > 0) {
        annualizedSharpe = (avgReturn / Math.sqrt(variance)) * Math.sqrt(252);
    }

    let downsideSumSq = 0;
    let downsideCount = 0;
    for (let i = 0; i < dailyReturns.length; i++) {
        const r = dailyReturns[i];
        if (r < 0) {
            downsideSumSq += r * r;
            downsideCount += 1;
        }
    }

    let downsideDev = 0;
    if (downsideCount > 0) {
        downsideDev = Math.sqrt(downsideSumSq / downsideCount);
    }

    let sortino = 0;
    if (downsideDev > 0) {
        sortino = (avgReturn / downsideDev) * Math.sqrt(252);
    }

    let winCount = 0;
    for (let i = 0; i < filteredTrades.length; i++) {
        if (filteredTrades[i].exitPrice > filteredTrades[i].entryPrice) {
            winCount += 1;
        }
    }
    const winRate = filteredTrades.length ? (winCount / filteredTrades.length) * 100 : 0;

    let totalProfit = 0;
    let totalLoss = 0;
    for (let i = 0; i < filteredTrades.length; i++) {
        const t = filteredTrades[i];
        const shares = t.shares || 1;
        const pnl = (t.exitPrice - t.entryPrice) * shares;
        if (pnl > 0) {
            totalProfit += pnl;
        } else {
            totalLoss += Math.abs(pnl);
        }
    }

    const profitFactor = totalLoss ? totalProfit / totalLoss : 0;
    const recovery = maxDrawdownAbs ? (totalProfit + totalLoss) / maxDrawdownAbs : 0;
    const avgProfitPerTrade = filteredTrades.length ? (totalProfit - totalLoss) / filteredTrades.length : 0;

    return {
        totalReturn: totalReturn.toFixed(2),
        benchmark: benchmarkReturn.toFixed(2),
        sharpe: annualizedSharpe.toFixed(2),
        mdd: maxDrawdown.toFixed(2),
        winRate: winRate.toFixed(2),
        profitFactor: profitFactor.toFixed(2),
        sortino: sortino.toFixed(2),
        recovery: recovery.toFixed(2),
        numberOfTrades: filteredTrades.length,
        finalCapital: capital.toFixed(2),
        avgProfitPerTrade: avgProfitPerTrade.toFixed(2),
        equityCurve: equityCurve,
        benchmarkCurve: benchmarkCurve
    };
}

            // AKTUALIZACE DASHBOARDU
function updateDashboard(stats) {
    for (let key in stats) {
        const value = stats[key];
        const htmlElement = elements.stats[key];

        if (htmlElement) {

            if (key === 'totalReturn' || key === 'benchmark' || key === 'mdd' || key === 'winRate') {
                htmlElement.textContent = value + '%';
            } 
            else if (key === 'finalCapital' || key === 'avgProfitPerTrade') {
                htmlElement.textContent = '$' + value;
            } 
            else {
                htmlElement.textContent = value;
            }
        }
    }
}

            // RENDEROVÁNÍ GRAFŮ
function renderCharts(marketData, trades, equityData, benchmarkData) {

    if (mainChart) {
        mainChart.remove();
        perfChart.remove();
    }

    const backgroundOptions = {
        layout: {
            background: { color: '#ffffff' },
            textColor: '#333333',
        }
    };

    mainChart = LightweightCharts.createChart(elements.mainChart, {
        height: 400,
        layout: backgroundOptions.layout
    });
    
    const candleSeries = mainChart.addCandlestickSeries();
    candleSeries.setData(marketData);

    const markers = [];
    trades.forEach(trade => {
        markers.push({
            time: trade.entryTime,
            position: 'belowBar',
            color: 'green',
            shape: 'arrowUp',
            text: 'Buy'
        });

        markers.push({
            time: trade.exitTime,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'Sell'
        });
    });
    candleSeries.setMarkers(markers);

    perfChart = LightweightCharts.createChart(elements.perfChart, {
        height: 300,
        layout: backgroundOptions.layout
    });

    const equityLine = perfChart.addLineSeries({ color: '#2962FF', lineWidth: 2 });
    equityLine.setData(equityData);

    const benchmarkLine = perfChart.addLineSeries({ color: '#FF6B00', lineWidth: 2 });
    benchmarkLine.setData(benchmarkData);

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
        if (range) {
            perfChart.timeScale().setVisibleLogicalRange(range);
        }
    });

    perfChart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
        if (range) {
            mainChart.timeScale().setVisibleLogicalRange(range);
        }
    });
}

            // AKTUALIZACE URL
function updateURL(formData) {

    const urlParams = new URLSearchParams();
    urlParams.set('symbol', formData.symbol);
    urlParams.set('start', formData.startDate);
    urlParams.set('end', formData.endDate);

    const newRelativePath = window.location.pathname + '?' + urlParams.toString();

    window.history.pushState({}, '', newRelativePath);
}

            // ULOŽENÍ ANALÝZY DO HISTORIE + TRADES DO LOCALSTORAGE
function saveToHistory(formData, stats) {
    const history = JSON.parse(localStorage.getItem('candleViewerHistory') || '[]');
    const analysisId = Date.now().toString();

    const analysisData = {
        id: analysisId,
        timestamp: new Date().toISOString(),
        symbol: formData.symbol,
        startDate: formData.startDate,
        endDate: formData.endDate,
        capital: formData.capital,
        dateRange: `${formData.startDate} - ${formData.endDate}`,
        totalReturn: stats.totalReturn,
        sharpe: stats.sharpe
    };
    
    history.unshift(analysisData);
    localStorage.setItem('candleViewerHistory', JSON.stringify(history.slice(0, 10)));

    const currentTrades = window.currentTrades;
    if (currentTrades) {
        localStorage.setItem(`analysis_${analysisId}_trades`, JSON.stringify(currentTrades));
    }
    
    loadHistory();
}

            // NAČTENÍ HISTORIE ANALÝZ
function loadHistory() {

    const historyText = localStorage.getItem('candleViewerHistory');
    const history = historyText ? JSON.parse(historyText) : [];

    elements.historyList.innerHTML = '';

    if (history.length === 0) {
        elements.historyList.innerHTML = '<li>(Zatím prázdné)</li>';
        return;
    }

    for (let i = 0; i < history.length; i++) {
        const item = history[i];
        const date = new Date(item.timestamp).toLocaleString('cs-CZ');     
        const li = `
            <li style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span onclick="loadAnalysisFromHistory('${item.id}')" style="cursor: pointer; flex-grow: 1;">
                    ${date} - ${item.symbol} - Return: ${item.totalReturn}%
                </span>
                <button onclick="deleteAnalysis('${item.id}')" style="color: red; cursor: pointer; border: none; background: none;">
                    ❌
                </button>
            </li>
        `;
        elements.historyList.innerHTML += li;
    }
}

            // SMAZÁNÍ ANALÝZY Z HISTORIE A LOCALSTORAGE
function deleteAnalysis(id) {
    if (confirm('Opravdu chcete smazat tuto analýzu?')) {
        const history = JSON.parse(localStorage.getItem('candleViewerHistory') || '[]');
        const updatedHistory = [];
        for (let i = 0; i < history.length; i++) {
            if (history[i].id !== id) {
                updatedHistory.push(history[i]);
            }
        }
        localStorage.removeItem("analysis_" + id + "_trades");
        localStorage.setItem('candleViewerHistory', JSON.stringify(updatedHistory));
        loadHistory();
    }
}

            // NAČTENÍ ANALÝZY Z HISTORIE
async function loadAnalysisFromHistory(analysisId) {
    try {
        const history = JSON.parse(localStorage.getItem('candleViewerHistory') || '[]');

        let analysis = null;
        for (let i = 0; i < history.length; i++) {
            if (history[i].id === analysisId) {
                analysis = history[i];
                break;
            }
        }

        if (!analysis) {
            alert('Analýza nenalezena');
            return;
        }
        const tradesData = localStorage.getItem(`analysis_${analysisId}_trades`);
        if (!tradesData) {
            alert('Obchody pro tuto analýzu nebyly nalezeny');
            return;
        }
        
        const trades = JSON.parse(tradesData);
        $('symbol').value = analysis.symbol;
        $('startDate').value = analysis.startDate;
        $('endDate').value = analysis.endDate;
        $('capital').value = analysis.capital;
        const marketData = await fetchMarketData({
            symbol: analysis.symbol,
            startDate: analysis.startDate,
            endDate: analysis.endDate,
            capital: analysis.capital
        });
        window.currentTrades = trades;
        window.currentMarketData = marketData;
        const stats = calculateStatistics(marketData, trades, analysis.capital);
        updateDashboard(stats);
        renderCharts(marketData, trades, stats.equityCurve, stats.benchmarkCurve);
        const params = new URLSearchParams({ 
            symbol: analysis.symbol, 
            start: analysis.startDate, 
            end: analysis.endDate,
            id: analysisId 
        });
        window.history.pushState({}, '', `${window.location.pathname}?${params}`);
        
    } catch (error) {
        alert('Chyba při načítání analýzy: ' + error.message);
    }
}

            // EXPORT FUNKCÍ PRO HTML
window.loadAnalysisFromHistory = loadAnalysisFromHistory;
window.deleteAnalysis = deleteAnalysis;