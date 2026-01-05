"""
CandleViewer Backend (Flask + yfinance)
Stahování historických OHLCV dat z yfinance.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import yfinance as yf
from datetime import datetime, timedelta
import os
import time
from functools import lru_cache

app = Flask(__name__, 
            static_folder='../frontend/static',
            template_folder='../frontend/templates')
CORS(app)

# Cache pro validaci symbolů (5 minut TTL)
symbol_cache = {}
CACHE_TTL = 300

# Rate limiting
last_request_time = 0
MIN_REQUEST_INTERVAL = 0.5  # Minimálně 500ms mezi requesty


@app.route('/')
def index():
    """Vrátí hlavní HTML stránku"""
    return send_from_directory(app.template_folder, 'index.html')


@app.route('/api/market-data', methods=['POST'])
def get_market_data():
    """
    Endpoint pro stažení historických OHLCV dat z yfinance.
    
    Očekává JSON:
    {
        "symbol": "AAPL",
        "startDate": "2023-01-01",
        "endDate": "2023-12-31",
        "interval": "1d"  // optional, default "1d"
    }
    
    Vrací JSON:
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
            },
            ...
        ]
    }
    """
    global last_request_time
    
    try:
        # Rate limiting
        current_time = time.time()
        time_since_last = current_time - last_request_time
        if time_since_last < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - time_since_last)
        
        last_request_time = time.time()
        
        data = request.get_json()
        
        # Validace vstupních dat
        symbol = data.get('symbol', '').upper().strip()
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        interval = data.get('interval', '1d')
        
        if not symbol:
            return jsonify({'error': 'Symbol je povinný parametr'}), 400
        
        if not start_date or not end_date:
            return jsonify({'error': 'Datum začátku a konce je povinné'}), 400
        
        # Stažení dat z yfinance
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start_date, end=end_date, interval=interval)
        
        if df.empty:
            return jsonify({
                'error': f'Žádná data pro symbol {symbol} v daném období',
                'symbol': symbol
            }), 404
        
        # Konverze DataFrame na JSON formát pro Lightweight Charts
        ohlcv_data = []
        for index, row in df.iterrows():
            # Konverze Timestamp na string formát YYYY-MM-DD
            if interval == '1d':
                time_str = index.strftime('%Y-%m-%d')
            else:
                # Pro intraday data použij Unix timestamp
                time_str = int(index.timestamp())
            
            ohlcv_data.append({
                'time': time_str,
                'open': round(float(row['Open']), 2),
                'high': round(float(row['High']), 2),
                'low': round(float(row['Low']), 2),
                'close': round(float(row['Close']), 2),
                'volume': int(row['Volume'])
            })
        
        response = {
            'symbol': symbol,
            'interval': interval,
            'data': ohlcv_data,
            'dataPoints': len(ohlcv_data)
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        return jsonify({
            'error': f'Chyba při stahování dat: {str(e)}'
        }), 500


@app.route('/api/validate-symbol', methods=['GET'])
def validate_symbol():
    """
    Robustní validace symbolu bez využití ticker.info.
    Místo toho se pokusíme stáhnout poslední 5 dní dat.
    Pokud se podaří, symbol je platný.
    Query param: ?symbol=AAPL
    """
    global last_request_time
    
    try:
        symbol = request.args.get('symbol', '').upper().strip()
        
        if not symbol:
            return jsonify({'valid': False, 'error': 'Symbol je prázdný'}), 400
        
        # Kontrola cache
        current_time = time.time()
        if symbol in symbol_cache:
            cached_data, cache_time = symbol_cache[symbol]
            if current_time - cache_time < CACHE_TTL:
                cached_data['cached'] = True
                return jsonify(cached_data), 200
        
        # Rate limiting
        time_since_last = current_time - last_request_time
        if time_since_last < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - time_since_last)
        
        last_request_time = time.time()
        
        # Retry logika s exponential backoff
        max_retries = 3
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                ticker = yf.Ticker(symbol)
                df = ticker.history(period='5d')
                
                if df.empty:
                    # Symbol neexistuje nebo nemá data
                    result = {
                        'valid': False,
                        'error': f'Symbol {symbol} nebyl nalezen nebo nemá dostupná data'
                    }
                    symbol_cache[symbol] = (result, time.time())
                    return jsonify(result), 404
                
                result = {
                    'valid': True,
                    'symbol': symbol,
                    'name': symbol,
                    'cached': False
                }
                # Uložit do cache
                symbol_cache[symbol] = (result, time.time())
                return jsonify(result), 200
                    
            except Exception as e:
                error_msg = str(e)
                if '429' in error_msg and attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2  # exponential backoff
                    continue
                else:
                    raise
        
        # Pokud jsme vyčerpali všechny pokusy
        return jsonify({
            'valid': False,
            'error': 'Příliš mnoho požadavků. Zkuste to za chvíli znovu.'
        }), 429
            
    except Exception as e:
        error_msg = str(e)
        if '429' in error_msg:
            return jsonify({
                'valid': False,
                'error': 'Příliš mnoho požadavků na Yahoo Finance. Zkuste to za chvíli znovu.',
                'retryAfter': 60
            }), 429
        else:
            return jsonify({
                'valid': False,
                'error': f'Chyba při validaci: {error_msg}'
            }), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'CandleViewer Backend',
        'timestamp': datetime.now().isoformat()
    }), 200


if __name__ == '__main__':
    print("=" * 60)
    print("🚀 CandleViewer Backend Server")
    print("=" * 60)
    print("📊 Funkcionalita:")
    print("   - Stahování OHLCV dat z yfinance")
    print("   - Validace symbolů")
    print("   - Buy & Hold benchmark: FRONTEND (StatsEngine)")
    print("=" * 60)
    print("🌐 Server běží na: http://localhost:5000")
    print("=" * 60)
    
    app.run(debug=False, host='0.0.0.0', port=15892)
