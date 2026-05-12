import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path

from app.app import UpstoxClient
from app.paper_trade import PaperTradeStore

# Define paths relative to this script
BASE_DIR = Path(__file__).resolve().parents[1]
MARKET_DB_PATH = str(BASE_DIR / "market_data.db")
PAPER_DB_PATH = str(BASE_DIR / "paper_trade.db")

def _init_market_db():
    """Create the local market data tables if they don't exist."""
    with sqlite3.connect(MARKET_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_ohlcv (
                isin TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume REAL,
                open_interest REAL,
                PRIMARY KEY (isin, timestamp)
            )
        """)
        conn.commit()

def ingest_historical_data(days_back: int = 250):
    """
    Fetch the last N days of OHLCV data for every stock in the watchlist
    and save it locally using INSERT OR REPLACE to prevent duplicates.
    """
    print(f"📦 Initializing data ingestion (Target: {days_back} days)...")
    
    try:
        client = UpstoxClient()
    except Exception as e:
        print(f"❌ Failed to initialize UpstoxClient: {e}")
        return

    store = PaperTradeStore(PAPER_DB_PATH)
    watchlist = store.list_stocks(limit=1000)
    
    if not watchlist:
        print("⚠️ Watchlist is empty. Nothing to fetch.")
        return

    _init_market_db()
    
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days_back)
    
    start_str = start_date.isoformat()
    end_str = end_date.isoformat()

    print(f"📅 Date Range: {start_str} to {end_str}")
    print(f"📋 Found {len(watchlist)} stocks in watchlist.\n")

    with sqlite3.connect(MARKET_DB_PATH) as conn:
        for stock in watchlist:
            isin = stock["isin"]
            name = stock["name"]
            print(f"🔄 Fetching {name} ({isin})... ", end="", flush=True)
            
            try:
                candles = client.get_historical_candles(
                    isin=isin,
                    start_date=start_str,
                    end_date=end_str,
                    interval="day",
                    count=1
                )
                
                if not candles:
                    print("No data returned.")
                    continue

                # Prepare data for bulk insert
                records = []
                for row in candles:
                    # Upstox returns: [Timestamp, Open, High, Low, Close, Volume, Open Interest]
                    records.append((
                        isin, 
                        str(row[0]),  # timestamp
                        float(row[1]), # open
                        float(row[2]), # high
                        float(row[3]), # low
                        float(row[4]), # close
                        float(row[5]), # volume
                        float(row[6])  # oi
                    ))

                # Bulk upsert
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO daily_ohlcv 
                    (isin, timestamp, open, high, low, close, volume, open_interest)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, 
                    records
                )
                conn.commit()
                print(f"✅ Saved {len(records)} candles.")
                
            except Exception as e:
                print(f"❌ Error: {e}")
            
            # Brief pause to respect Upstox API rate limits (adjust as needed)
            time.sleep(0.5)

    print("\n🎉 Data ingestion complete!")

if __name__ == "__main__":
    ingest_historical_data()