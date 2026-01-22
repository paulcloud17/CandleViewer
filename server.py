from flask import Flask, request, jsonify, send_from_directory
import yfinance as yf
import pandas as pd

app = Flask(__name__, static_url_path='', static_folder='.')

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# API Endpoint pro data [cite: 20]
@app.route('/api/data', methods=['POST'])
def get_data():
    data = request.json
    ticker = data.get('symbol', 'AAPL')
    start = data.get('startDate')
    end = data.get('endDate')

    print(f"Stahuji data pro {ticker} od {start} do {end}...")
    
    # Stažení dat přes yfinance
    df = yf.download(ticker, start=start, end=end, progress=False)
    
    # Výpočet Buy & Hold (normalizováno na % změnu)
    #  Backend využije data k výpočtu referenční křivky
    first_price = df['Close'].iloc[0].item()
    
    result = []
    for index, row in df.iterrows():
        close_price = row['Close'].item()
        
        # Buy & Hold hodnota v procentech (pro srovnání s equity)
        bh_value = ((close_price - first_price) / first_price) * 100
        
        date_str = index.strftime('%Y-%m-%d')
        result.append({
            'time': date_str,
            'open': row['Open'].item(),
            'high': row['High'].item(),
            'low': row['Low'].item(),
            'close': close_price,
            'benchmark_pct': bh_value
        })
        
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, port=5000)