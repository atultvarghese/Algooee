import sqlite3
import json
import pandas as pd
from datetime import datetime
from pathlib import Path

from core.prediction import Prediction
from scripts.ingest_market_data import ingest_historical_data, MARKET_DB_PATH, PAPER_DB_PATH
from app.paper_trade import PaperTradeStore

def _init_predictions_db():
    """Create a table to store the pre-computed predictions."""
    with sqlite3.connect(MARKET_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_predictions (
                isin TEXT PRIMARY KEY,
                predicted_high REAL,
                p10 REAL,
                p90 REAL,
                mae REAL,
                mape REAL,
                confidence TEXT,
                forecast_json TEXT,
                future_forecast_json TEXT,
                backtest_json TEXT,
                updated_at TEXT
            )
        """)
        conn.commit()

def run_pipeline():
    print("🚀 STARTING NIGHTLY ALGO PIPELINE...\n")
    
    # We only need to fetch the last 10 days to append recent data, keeping it fast!
    ingest_historical_data(days_back=10)
    
    print("\n🧠 STARTING MODEL TRAINING PHASE...")
    _init_predictions_db()
    
    store = PaperTradeStore(PAPER_DB_PATH)
    watchlist = store.list_stocks(limit=1000)

    with sqlite3.connect(MARKET_DB_PATH) as conn:
        for stock in watchlist:
            isin = stock["isin"]
            print(f"⚙️ Training model for {stock['name']} ({isin})...", end=" ", flush=True)
            
            # Load local data into Pandas
            df = pd.read_sql_query(
                f"SELECT timestamp as Timestamp, open as Open, high as High, low as Low, close as Close, volume as Volume, open_interest as 'Open Interest' FROM daily_ohlcv WHERE isin = '{isin}' ORDER BY timestamp ASC", 
                conn
            )
            
            if len(df) < 80:
                print("⚠️ Not enough local data. Skipping.")
                continue
                
            try:
                # Run the ML Engine
                predictor = Prediction(df)
                predictor.feature_engineering()
                predictor.train_model()
                
                forecast = predictor.predict_next_day()
                future_forecast = predictor.predict_future_days(days=5)
                backtest = predictor.get_backtest_points(limit=15)
                
                # Derive Confidence
                predicted_high = float(forecast.get("predicted_high", 0.0))
                mae = float(forecast.get("mae", 0.0))
                mape = float(forecast.get("mape", 0.0))
                error_ratio = mae / max(abs(predicted_high), 1.0)
                confidence = "high" if (mape <= 2.0 and error_ratio <= 0.02) else "moderate"
                
                # Upsert into DB
                conn.execute("""
                    INSERT OR REPLACE INTO daily_predictions 
                    (isin, predicted_high, p10, p90, mae, mape, confidence, forecast_json, future_forecast_json, backtest_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    isin, predicted_high, float(forecast.get("p10", predicted_high)), 
                    float(forecast.get("p90", predicted_high)), mae, mape, confidence,
                    json.dumps(forecast), json.dumps(future_forecast), json.dumps(backtest)
                ))
                conn.commit()
                print("✅ Ready!")
                
            except Exception as e:
                print(f"❌ ML Error: {e}")

    print("\n✨ PIPELINE COMPLETE! All predictions are cached and ready for tomorrow.")

if __name__ == "__main__":
    run_pipeline()