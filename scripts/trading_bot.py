import sqlite3
import time
from pathlib import Path
from datetime import datetime, timedelta
from app.paper_trade import PaperTradeStore
from app.app import UpstoxClient

BASE_DIR = Path(__file__).resolve().parents[1]
MARKET_DB_PATH = str(BASE_DIR / "market_data.db")
PAPER_DB_PATH = str(BASE_DIR / "paper_trade.db")

# --- STRATEGY PARAMETERS ---
TRADE_AMOUNT_INR = 5000.0  # Amount to allocate per stock
MIN_UPSIDE_PCT = 1.015     # Minimum 1.5% predicted upside required to buy
MAX_POSITIONS = 5          # Maximum concurrent holdings

def run_trading_bot():
    print("🤖 ALGOOEE TRADING BOT AWAKE...")
    
    # 1. Initialize Clients and Storage
    store = PaperTradeStore(PAPER_DB_PATH)
    try:
        client = UpstoxClient()
    except Exception as e:
        print(f"❌ Failed to connect to Upstox for live prices: {e}")
        return

    # 2. Check Wallet and Holdings
    cash_balance = store.get_cash_balance()
    holdings = store.list_holdings()
    held_isins = {h['isin'] for h in holdings}
    
    print(f"💰 Current Cash: ₹{cash_balance:.2f} | Open Positions: {len(holdings)}")

    if len(holdings) >= MAX_POSITIONS:
        print("🛑 Maximum positions reached. No new buys today.")
        return

    if cash_balance < TRADE_AMOUNT_INR:
        print("🛑 Insufficient funds to place new trades.")
        return

    watchlist = store.list_stocks(limit=100)
    
    # 3. Connect to Market DB and Execute Strategy
    with sqlite3.connect(MARKET_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        
        # --- STALE DATA KILL SWITCH ---
        sample_pred = conn.execute("SELECT updated_at FROM daily_predictions LIMIT 1").fetchone()
        if sample_pred:
            # SQLite stores datetime('now') as 'YYYY-MM-DD HH:MM:SS'
            updated_at = datetime.strptime(sample_pred["updated_at"], "%Y-%m-%d %H:%M:%S")
            if datetime.utcnow() - updated_at > timedelta(hours=72):
                print(f"🛑 CRITICAL: Predictions are stale (Last updated: {updated_at}).")
                print("The nightly pipeline likely failed. Halting all trading to protect capital.")
                return
        else:
            print("🛑 CRITICAL: No predictions found in database. Halting.")
            return
        # ------------------------------
        
        for stock in watchlist:
            isin = stock["isin"]
            
            # Skip if we already hold it
            if isin in held_isins:
                continue
                
            # Get the pre-computed prediction
            pred_row = conn.execute(
                "SELECT predicted_high, confidence FROM daily_predictions WHERE isin = ?", 
                (isin,)
            ).fetchone()
            
            if not pred_row:
                continue
                
            predicted_high = float(pred_row["predicted_high"])
            confidence = pred_row["confidence"]
            
            # Fetch live market price
            try:
                # Fallback to fetching 1 candle if a direct live quote endpoint isn't available
                # Using a future end_date to ensure we get the latest available candle
                candles = client.get_historical_candles(
                    isin=isin, interval="day", count=1, 
                    start_date="2020-01-01", end_date="2030-01-01" 
                )
                if not candles:
                    continue
                current_price = float(candles[-1][4]) # Index 4 is the Close price
            except Exception as e:
                print(f"   ⚠️ Could not fetch live price for {isin}: {e}")
                continue

            # --- APPLY THE STRATEGY LOGIC ---
            if current_price <= 0:
                continue
                
            upside_ratio = predicted_high / current_price
            upside_pct = (upside_ratio - 1) * 100
            
            print(f"🔎 {stock['name']}: Live=₹{current_price:.2f}, Pred=₹{predicted_high:.2f} (Upside: {upside_pct:.2f}%)")
            
            if upside_ratio >= MIN_UPSIDE_PCT and confidence == "high":
                print(f"   🚀 STRATEGY TRIGGERED! Buying ₹{TRADE_AMOUNT_INR} of {stock['name']}...")
                
                try:
                    store.place_order(
                        isin=isin, 
                        side="buy", 
                        amount=TRADE_AMOUNT_INR, 
                        price=current_price
                    )
                    cash_balance -= TRADE_AMOUNT_INR
                    held_isins.add(isin)
                    print("   ✅ Order executed successfully.")
                except Exception as e:
                    print(f"   ❌ Order failed: {e}")
                
                # Stop if we run out of money or hit max positions
                if cash_balance < TRADE_AMOUNT_INR or len(held_isins) >= MAX_POSITIONS:
                    print("🛑 Portfolio limits reached. Halting operations for today.")
                    break
            
            # Rate limit protection for Upstox API calls
            time.sleep(0.5)

    print("💤 TRADING BOT GOING TO SLEEP.")

if __name__ == "__main__":
    run_trading_bot()