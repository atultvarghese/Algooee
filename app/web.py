import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.app import UpstoxClient
from app.paper_trade import PaperTradeStore
from core.prediction import Prediction

app = FastAPI(
    title="Algooee API",
    description="Stock prediction and analysis API",
    version="1.0.0",
)

# Allow the frontend dev servers to access this API (Vite default ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class StockPredictionRequest(BaseModel):
    isin: str
    start_date: str
    end_date: str
    interval: str = "day"
    count: int = 1
    forecast_days: int = 5
    backtest_days: int = 10


class HistoricalCandleResponse(BaseModel):
    isin: str
    data: List[List]
    timestamp: str


class PaperFundRequest(BaseModel):
    amount: float
    note: Optional[str] = None


class PaperOrderRequest(BaseModel):
    isin: str
    side: str
    amount: float
    price: Optional[float] = None


class PaperResetRequest(BaseModel):
    initial_cash: float = 0.0


class StockAddRequest(BaseModel):
    isin: str
    name: str


# Initialize client
try:
    client = UpstoxClient()
except ValueError:
    client = None

PAPER_STORE = PaperTradeStore(str(Path(__file__).resolve().parents[1] / "paper_trade.db"))

# Simple in-memory cache for expensive prediction calls
PREDICTION_CACHE = {}
PREDICTION_CACHE_TTL_SECONDS = 300


def _fetch_latest_and_prev_close(isin: str):
    """Fetch latest close and previous close for day-over-day P/L."""
    if not client:
        return None, None, None

    try:
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=20)
        candles = client.get_historical_candles(
            isin=isin,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            interval="day",
            count=1,
        )
    except Exception:
        return None, None, None
    if not candles:
        return None, None, None

    headers = ["Timestamp", "Open", "High", "Low", "Close", "Volume", "Open Interest"]
    df = pd.DataFrame(candles, columns=headers)
    if df.empty:
        return None, None, None

    df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
    df["Close"] = pd.to_numeric(df["Close"], errors="coerce")
    df.dropna(subset=["Timestamp", "Close"], inplace=True)
    if df.empty:
        return None, None, None

    df.sort_values("Timestamp", inplace=True)
    latest_close = float(df["Close"].iloc[-1])
    prev_close = float(df["Close"].iloc[-2]) if len(df) >= 2 else latest_close
    as_of = df["Timestamp"].iloc[-1].strftime("%Y-%m-%d")
    return latest_close, prev_close, as_of


def _build_paper_portfolio_snapshot():
    cash_balance = PAPER_STORE.get_cash_balance()
    total_funded = PAPER_STORE.get_total_funded()
    holdings = PAPER_STORE.list_holdings()
    realized_pnl = PAPER_STORE.get_realized_pnl()
    stock_name_by_isin = {
        row["isin"]: row["name"] for row in PAPER_STORE.list_stocks(limit=2000)
    }

    positions = []
    invested_cost = 0.0
    market_value = 0.0
    unrealized_pnl = 0.0
    day_pnl = 0.0
    price_as_of = None

    for holding in holdings:
        isin = holding["isin"]
        qty = float(holding["quantity"])
        avg_price = float(holding["avg_price"])
        latest_close, prev_close, as_of = _fetch_latest_and_prev_close(isin)
        mark_price = float(latest_close) if latest_close is not None else avg_price
        prev_price = float(prev_close) if prev_close is not None else mark_price

        cost_value = qty * avg_price
        current_value = qty * mark_price
        position_unrealized = current_value - cost_value
        position_day_pnl = qty * (mark_price - avg_price)

        invested_cost += cost_value
        market_value += current_value
        unrealized_pnl += position_unrealized
        day_pnl += position_day_pnl
        if as_of:
            price_as_of = as_of

        positions.append(
            {
                "isin": isin,
                "name": stock_name_by_isin.get(isin, isin),
                "quantity": round(qty, 6),
                "avg_price": round(avg_price, 4),
                "current_price": round(mark_price, 4),
                "prev_close": round(prev_price, 4),
                "cost_value": round(cost_value, 2),
                "market_value": round(current_value, 2),
                "unrealized_pnl": round(position_unrealized, 2),
                "day_pnl": round(position_day_pnl, 2),
            }
        )

    positions.sort(key=lambda row: row["market_value"], reverse=True)

    equity = cash_balance + market_value
    total_pnl = realized_pnl + unrealized_pnl
    pnl_vs_funded = equity - total_funded

    return {
        "cash_balance": round(cash_balance, 2),
        "total_funded": round(total_funded, 2),
        "invested_cost": round(invested_cost, 2),
        "market_value": round(market_value, 2),
        "equity": round(equity, 2),
        "realized_pnl": round(realized_pnl, 2),
        "unrealized_pnl": round(unrealized_pnl, 2),
        "total_pnl": round(total_pnl, 2),
        "pnl_vs_funded": round(pnl_vs_funded, 2),
        "day_pnl": round(day_pnl, 2),
        "price_as_of": price_as_of,
        "positions": positions,
        "trades": PAPER_STORE.list_trades(limit=100),
        "cash_flows": PAPER_STORE.list_ledger(limit=100),
    }


# API Routes
@app.get("/", tags=["UI"])
async def root():
    """Root endpoint – UI removed, API only."""
    return {
        "message": "This server provides the Algooee API. Frontend moved to a"
        " separate React/Vite application."
    }


@app.get("/health", tags=["Health"])
async def health():
    """Health status check"""
    return {"status": "healthy", "api_configured": client is not None}


@app.post(
    "/api/historical-candles",
    tags=["Stock Data"],
    response_model=HistoricalCandleResponse,
)
async def get_historical_candles(request: StockPredictionRequest):
    """
    Fetch historical candle data for a stock.

    Args:
        isin: Instrument ISIN code (e.g., INE002A01018 for Reliance)
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        interval: Candle interval (day, month, etc.)
        count: Number of intervals per candle

    Returns:
        Historical candle data with timestamp, open, high, low, close, volume, open interest
    """
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Upstox API client not configured. Set UPSTOX_API_TOKEN in .env",
        )

    try:
        candles = client.get_historical_candles(
            isin=request.isin,
            start_date=request.start_date,
            end_date=request.end_date,
            interval=request.interval,
            count=request.count,
        )
        return HistoricalCandleResponse(
            isin=request.isin, data=candles, timestamp=request.end_date
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching candles: {str(e)}")


@app.post("/api/predict", tags=["Predictions"])
async def predict_stock(request: StockPredictionRequest):
    """
    Predict the next day's high price for a stock.

    Args:
        isin: Instrument ISIN code
        start_date: Start date for historical data
        end_date: End date for historical data
        interval: Data interval (default: day)
        count: Number of intervals (default: 1)

    Returns:
        Predicted high price and confidence level
    """
    if not client:
        raise HTTPException(status_code=503, detail="Upstox API client not configured")
    
    cache_key = (
        f"{request.isin}|{request.start_date}|{request.end_date}|{request.interval}|"
        f"{request.count}|{request.forecast_days}|{request.backtest_days}"
    )
    now_ts = time.time()
    cached = PREDICTION_CACHE.get(cache_key)
    if cached and (now_ts - cached["ts"] <= PREDICTION_CACHE_TTL_SECONDS):
        return cached["value"]

    try:
        # Fetch historical data (Network I/O - fast)
        candles = client.get_historical_candles(
            isin=request.isin,
            start_date=request.start_date,
            end_date=request.end_date,
            interval=request.interval,
            count=request.count,
        )

        if not candles:
            raise HTTPException(
                status_code=404,
                detail="No data found for the given ISIN and date range",
            )

        # Prepare data
        headers = ["Timestamp", "Open", "High", "Low", "Close", "Volume", "Open Interest"]
        df = pd.DataFrame(candles, columns=headers)

        # --- THE FIX: OFF-LOAD CPU HEAVY ML TASKS TO THREADPOOL ---
        predictor = Prediction(df)
        
        # feature_engineering and train_model are heavy Pandas/Scikit-Learn tasks
        await run_in_threadpool(predictor.feature_engineering)
        await run_in_threadpool(predictor.train_model)
        
        future_days = max(1, min(int(request.forecast_days or 5), 15))
        backtest_days = max(1, min(int(request.backtest_days or 10), 60))
        
        # Inference is also synchronous, so we thread it
        forecast = await run_in_threadpool(predictor.predict_next_day)
        future_forecast = await run_in_threadpool(predictor.predict_future_days, future_days)
        backtest = await run_in_threadpool(predictor.get_backtest_points, backtest_days)
        # ----------------------------------------------------------

        # Compatibility fields + richer payload
        predicted_high = float(forecast.get("predicted_high", 0.0))
        mae = float(forecast.get("mae", 0.0))
        mape = float(forecast.get("mape", 0.0))
        error_ratio = mae / max(abs(predicted_high), 1.0)
        confidence = "high" if (mape <= 2.0 and error_ratio <= 0.02) else "moderate"

        result = {
            "isin": request.isin,
            "predicted_high": predicted_high,
            "p10": float(forecast.get("p10", predicted_high)),
            "p90": float(forecast.get("p90", predicted_high)),
            "mae": mae,
            "mape": mape,
            "confidence": confidence,
            "forecast": forecast,
            "backtest": backtest,
            "future_forecast": future_forecast,
        }
        
        PREDICTION_CACHE[cache_key] = {"ts": now_ts, "value": result}
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction error: {str(e)}")


@app.get("/api/stocks", tags=["Reference"])
async def get_stock_list(q: Optional[str] = None):
    """Get dynamic watchlist stocks with optional search query."""
    try:
        return {"stocks": PAPER_STORE.list_stocks(query=q, limit=500)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stock list error: {str(e)}")


@app.get("/api/stocks/search", tags=["Reference"])
async def search_stock_list(q: str):
    """Search stocks in watchlist by name or ISIN."""
    try:
        return {"stocks": PAPER_STORE.list_stocks(query=q, limit=200)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stock search error: {str(e)}")


@app.post("/api/stocks/add", tags=["Reference"])
async def add_stock_to_watchlist(request: StockAddRequest):
    """Add or update a stock in watchlist."""
    try:
        added = PAPER_STORE.add_stock(isin=request.isin, name=request.name)
        return {"added": added, "stocks": PAPER_STORE.list_stocks(limit=500)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stock add error: {str(e)}")


@app.delete("/api/stocks/{isin}", tags=["Reference"])
async def remove_stock_from_watchlist(isin: str):
    """Remove stock from watchlist."""
    try:
        PAPER_STORE.remove_stock(isin=isin)
        return {"stocks": PAPER_STORE.list_stocks(limit=500)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stock remove error: {str(e)}")


@app.get("/api/paper/portfolio", tags=["Paper Trading"])
async def get_paper_portfolio():
    """Get current paper trading wallet, holdings, trades and P/L."""
    try:
        return _build_paper_portfolio_snapshot()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Paper portfolio error: {str(e)}")


@app.get("/api/paper/admin", tags=["Paper Trading"])
async def get_paper_admin():
    """Admin summary for paper trading."""
    try:
        return _build_paper_portfolio_snapshot()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Paper admin error: {str(e)}")


@app.post("/api/paper/admin/fund", tags=["Paper Trading"])
async def paper_fund_wallet(request: PaperFundRequest):
    """Add paper money to wallet."""
    try:
        PAPER_STORE.add_funds(amount=float(request.amount), note=request.note)
        return _build_paper_portfolio_snapshot()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Paper funding error: {str(e)}")


@app.post("/api/paper/trade", tags=["Paper Trading"])
async def paper_place_trade(request: PaperOrderRequest):
    """Execute a paper BUY/SELL order using amount-based input."""
    try:
        execution_price = None
        if request.price is not None and float(request.price) > 0:
            execution_price = float(request.price)
        else:
            latest_close, _, _ = _fetch_latest_and_prev_close(request.isin)
            if latest_close is not None:
                execution_price = float(latest_close)

        if execution_price is None or execution_price <= 0:
            raise HTTPException(
                status_code=400,
                detail="Could not resolve execution price. Ensure market data is available.",
            )

        order = PAPER_STORE.place_order(
            isin=request.isin,
            side=request.side,
            amount=float(request.amount),
            price=execution_price,
        )
        return {
            "order": {
                "isin": order.isin,
                "side": order.side,
                "amount": round(order.amount, 2),
                "quantity": round(order.quantity, 6),
                "price": round(order.price, 4),
                "gross_value": round(order.gross_value, 2),
                "realized_pnl": round(order.realized_pnl, 2),
                "cash_balance": round(order.cash_balance, 2),
            },
            "portfolio": _build_paper_portfolio_snapshot(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Paper trade error: {str(e)}")


@app.post("/api/paper/admin/reset", tags=["Paper Trading"])
async def paper_reset_account(request: PaperResetRequest):
    """Reset paper account and optionally seed new cash."""
    try:
        PAPER_STORE.reset(initial_cash=float(request.initial_cash or 0.0))
        return _build_paper_portfolio_snapshot()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Paper reset error: {str(e)}")
