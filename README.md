# CandleViewer - Backtest Analysis Application

Webová aplikace pro vizualizaci výsledků algoritmického obchodování (backtestů) s převážně frontendovou logikou.

## 🎯 Vlastnosti

- **📊 Vizualizace OHLCV dat** z yfinance pomocí Lightweight Charts
- **💰 Dynamický výpočet Equity křivky** z obchodů a počátečního kapitálu (frontend)
- **📈 Buy & Hold Benchmark** vypočítaný na frontendu (StatsEngine)
- **📉 Synchronizované grafy** - Main Chart (svíčky + markery) + Performance Chart (Equity vs B&H)
- **🧮 Komplexní metriky** - Sharpe Ratio, Sortino Ratio, Max Drawdown, Profit Factor, Win Rate
- **💾 localStorage** - historie analýz
- **🔗 URL state** - sdílení konkrétního zobrazení

## 📁 Struktura Projektu

```
CandleViewer_v.1/
├── backend/
│   ├── app.py              # Flask server (pouze OHLCV data z yfinance)
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── static/
│   │   ├── css/
│   │   │   └── styles.css  # Styling
│   │   └── js/
│   │       ├── app.js                    # Hlavní orchestrátor
│   │       ├── modules/
│   │       │   ├── DataFetcher.js       # AJAX komunikace s Flask API
│   │       │   ├── StatsEngine.js       # Výpočet metrik + B&H benchmark
│   │       │   ├── BacktestProcessor.js # Zpracování trade logů
│   │       │   ├── ChartManager.js      # Lightweight Charts wrapper
│   │       │   └── StateManager.js      # URL params + localStorage
│   │       └── utils/
│   │           ├── dataTransform.js     # Transformace OHLCV
│   │           ├── dateUtils.js         # Práce s datumy
│   │           └── validators.js        # Validace vstupů
│   └── templates/
│       └── index.html      # HTML layout s formuláři
└── package.json            # NPM konfigurace
```

## 🚀 Instalace

### Backend (Python)

```bash
cd backend
pip install -r requirements.txt
```

### Frontend (JavaScript)

Aplikace používá vanilla JavaScript s ES6 moduly. Není potřeba build process.
Lightweight Charts se načítá z CDN.

## ▶️ Spuštění

```bash
# Z root složky projektu
python backend/app.py

# nebo
npm run dev
```

Server poběží na `http://localhost:5000`

## 📋 Formát Backtest Logu

### CSV formát:
```csv
entryTime,entryPrice,exitTime,exitPrice,shares,type
2023-01-05,150.5,2023-01-10,155.2,100,long
2023-02-01,148.0,2023-02-05,146.5,100,short
```

### JSON formát:
```json
{
  "trades": [
    {
      "entryTime": "2023-01-05",
      "entryPrice": 150.5,
      "exitTime": "2023-01-10",
      "exitPrice": 155.2,
      "shares": 100,
      "type": "long"
    }
  ]
}
```

## 🔧 API Endpointy

### POST `/api/market-data`
Stáhne historická OHLCV data.

**Request:**
```json
{
  "symbol": "AAPL",
  "startDate": "2023-01-01",
  "endDate": "2023-12-31",
  "interval": "1d"
}
```

**Response:**
```json
{
  "symbol": "AAPL",
  "interval": "1d",
  "data": [
    {
      "time": "2023-01-01",
      "open": 150.5,
      "high": 152.3,
      "low": 149.8,
      "close": 151.2,
      "volume": 50000000
    }
  ],
  "dataPoints": 252
}
```

### GET `/api/validate-symbol?symbol=AAPL`
Validuje existenci symbolu.

## 🧮 Frontend Kalkulace

Veškeré výpočty probíhají v **StatsEngine.js**:

- **Equity křivka**: Dynamicky z `initialCapital` + iterace přes trades
- **Buy & Hold benchmark**: `(closePrice / firstPrice - 1) * 100`
- **Sharpe Ratio**: `(mean(returns) - riskFree) / stdDev(returns) * √252`
- **Sortino Ratio**: Pouze downside deviation
- **Max Drawdown**: Iterace přes equity peak
- **Profit Factor**: `sumWins / sumLosses`
- **Win Rate**: `winningTrades / totalTrades * 100`

## 🎨 Technologie

- **Backend**: Python 3.10+, Flask, yfinance
- **Frontend**: Vanilla JavaScript (ES6 modules), Lightweight Charts
- **Data**: AJAX, JSON
- **Storage**: localStorage (browser)
- **Charts**: TradingView Lightweight Charts 4.1

## 📝 Licence

MIT

---

**Vytvořeno**: 1.1.2026  
**Autor**: Pavel Mráček
