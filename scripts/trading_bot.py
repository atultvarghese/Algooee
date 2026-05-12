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
TAKE_PROFIT_PCT = 0.03     # Sell if up 3%
STOP_LOSS_PCT = -0.02      # Sell if down 2%

def run_trading_bot():
    print("🤖 ALGOOEE TRADING BOT AWAKE...")
    
    # 1. Initialize Clients and Storage
    store = PaperTradeStore(PAPER_DB_PATH)
    try:
        client = UpstoxClient()
    except Exception as e:
        print(f"❌ Failed to connect to Upstox: {e}")
        return

    # 2. Check Wallet and Holdings
    cash_balance = store.get_cash_balance()
    holdings = store.list_holdings()
    held_isins = {h['isin'] for h in holdings}
    
    print(f"💰 Cash: ₹{cash_balance:.2f} | Open Positions: {len(holdings)}")

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
        if not sample_pred or datetime.utcnow() - datetime.strptime(sample_pred["updated_at"], "%Y-%m-%d %H:%M:%S") > timedelta(hours=72):
            print("🛑 CRITICAL: Stale or missing predictions. Halting.")
            return

        # ==========================================
        # 1. THE EXIT STRATEGY (Evaluate Holdings)
        # ==========================================
        print("\n🛡️ EVALUATING OPEN POSITIONS...")
        for holding in holdings:
            isin = holding["isin"]
            avg_price = float(holding["avg_price"])
            qty = float(holding["quantity"])

            try:
                candles = client.get_historical_candles(isin=isin, interval="day", count=1, start_date="2020-01-01", end_date="2030-01-01")
                current_price = float(candles[-1][4])
            except Exception:
                continue

            pnl_pct = (current_price - avg_price) / avg_price
            
            # Check if prediction turned bearish
            pred_row = conn.execute("SELECT predicted_high FROM daily_predictions WHERE isin = ?", (isin,)).fetchone()
            pred_bearish = False
            if pred_row and current_price > 0:
                upside = (float(pred_row["predicted_high"]) / current_price) - 1
                pred_bearish = upside < 0 

            # Sell Conditions
            if pnl_pct >= TAKE_PROFIT_PCT or pnl_pct <= STOP_LOSS_PCT or pred_bearish:
                reason = "TAKE PROFIT" if pnl_pct >= TAKE_PROFIT_PCT else ("STOP LOSS" if pnl_pct <= STOP_LOSS_PCT else "BEARISH PREDICTION")
                print(f"   📉 EXIT TRIGGERED ({reason}) for {isin}: Live=₹{current_price:.2f}, PnL={pnl_pct*100:.2f}%")

                sell_amount = qty * current_price # Sell the entire position
                try:
                    store.place_order(isin=isin, side="sell", amount=sell_amount, price=current_price)
                    cash_balance += sell_amount
                    held_isins.remove(isin)
                    print("      ✅ Sell executed.")
                except Exception as e:
                    print(f"      ❌ Sell failed: {e}")
            else:
                print(f"   🔒 HOLDING {isin}: PnL={pnl_pct*100:.2f}%")

        # ==========================================
        # 2. THE ENTRY STRATEGY (Look for new Buys)
        # ==========================================
        print("\n🔭 SCANNING FOR NEW OPPORTUNITIES...")
        if len(held_isins) >= MAX_POSITIONS or cash_balance < TRADE_AMOUNT_INR:
            print("🛑 Limits reached or insufficient funds. Done for today.")
            return

        watchlist = store.list_stocks(limit=100)
        for stock in watchlist:
            isin = stock["isin"]
            if isin in held_isins:
                continue
                
            pred_row = conn.execute("SELECT predicted_high, confidence FROM daily_predictions WHERE isin = ?", (isin,)).fetchone()
            if not pred_row:
                continue
                
            predicted_high = float(pred_row["predicted_high"])
            confidence = pred_row["confidence"]
            
            try:
                candles = client.get_historical_candles(isin=isin, interval="day", count=1, start_date="2020-01-01", end_date="2030-01-01")
                current_price = float(candles[-1][4])
            except Exception:
                continue

            upside_ratio = predicted_high / current_price
            if upside_ratio >= MIN_UPSIDE_PCT and confidence == "high":
                print(f"   🚀 BUYING {stock['name']} (Upside: {(upside_ratio-1)*100:.2f}%)")
                try:
                    store.place_order(isin=isin, side="buy", amount=TRADE_AMOUNT_INR, price=current_price)
                    cash_balance -= TRADE_AMOUNT_INR
                    held_isins.add(isin)
                except Exception as e:
                    print(f"      ❌ Buy failed: {e}")
                
                if cash_balance < TRADE_AMOUNT_INR or len(held_isins) >= MAX_POSITIONS:
                    break
            
            time.sleep(0.5)

    print("\n💤 TRADING BOT GOING TO SLEEP.")

if __name__ == "__main__":
    run_trading_bot()