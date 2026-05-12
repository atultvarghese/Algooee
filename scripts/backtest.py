import sqlite3
import pandas as pd
import vectorbt as vbt
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
MARKET_DB_PATH = str(BASE_DIR / "market_data.db")

def run_vectorbt_backtest(isin: str):
    print(f"📊 Starting Backtest for {isin}...")

    # 1. Load your local market data
    with sqlite3.connect(MARKET_DB_PATH) as conn:
        df = pd.read_sql(
            "SELECT timestamp, close FROM daily_ohlcv WHERE isin = ? ORDER BY timestamp", 
            conn, 
            params=(isin,)
        )
    
    if df.empty:
        print("❌ No data found in database. Run ingest_market_data.py first.")
        return

    # 2. Format for VectorBT
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df.set_index('timestamp', inplace=True)
    price = df['close']

    # 3. Define Signals (Proxy for your ML strategy)
    # Here we simulate an entry/exit mechanism using moving averages
    fast_ma = vbt.MA.run(price, window=10)
    slow_ma = vbt.MA.run(price, window=20)
    
    # Enter when fast crosses above slow (Bullish)
    entries = fast_ma.ma_crossed_above(slow_ma)
    # Exit when fast crosses below slow (Bearish)
    exits = fast_ma.ma_crossed_below(slow_ma)

    # 4. Run the Simulation
    # Assume 100,000 starting cash and standard broker fees
    portfolio = vbt.Portfolio.from_signals(
        price, 
        entries, 
        exits,
        init_cash=100000.0,
        fees=0.001  # 0.1% transaction fee
    )

    # 5. Output the Results
    print("\n=== BACKTEST RESULTS ===")
    print(portfolio.stats())
    
    # Uncomment the line below to open an interactive HTML chart in your browser!
    # portfolio.plot().show()

if __name__ == "__main__":
    # Test it with TCS or whatever ISIN you have in your database
    run_vectorbt_backtest("INE467B01029")