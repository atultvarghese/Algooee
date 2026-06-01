import math
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# pyrefly: ignore [missing-import]
from app.app import UpstoxClient

# pyrefly: ignore [missing-import]
from app.paper_trade import PaperTradeStore

# pyrefly: ignore [missing-import]
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
    forecast_days: int = 1
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
    option_symbol: Optional[str] = None
    option_expiry: Optional[str] = None


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


def _get_db_path():
    frozen = getattr(sys, "frozen", False)
    if frozen:
        # Save db next to executable in compiled binary to ensure trading data is preserved
        exe_dir = Path(sys.executable).parent
        return str(exe_dir / "paper_trade.db")
    else:
        return str(Path(__file__).resolve().parents[1] / "paper_trade.db")


PAPER_STORE = PaperTradeStore(_get_db_path())

# Simple in-memory cache for expensive prediction calls
PREDICTION_CACHE = {}
PREDICTION_CACHE_TTL_SECONDS = 300
MARKET_TZ = timezone(timedelta(hours=5, minutes=30))


def _market_now():
    return datetime.now(MARKET_TZ)


def _fetch_close_snapshot(isin: str, start_date, end_date, interval: str):
    """Fetch latest and previous closes for one candle interval."""
    if not client:
        return None, None, None

    try:
        candles = client.get_historical_candles(
            isin=isin,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            interval=interval,
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
    as_of_format = "%Y-%m-%d %H:%M" if interval == "minute" else "%Y-%m-%d"
    as_of = df["Timestamp"].iloc[-1].strftime(as_of_format)
    return latest_close, prev_close, as_of


def _to_float_or_none(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _fetch_ltp_snapshot(isin: str):
    """Fetch current last traded price and previous close from market quote."""

    if not client:
        return None, None, None

    try:
        quote = client.get_ltp_quote(isin=isin)
    except Exception:
        return None, None, None

    last_price = _to_float_or_none(quote.get("last_price"))
    prev_close = _to_float_or_none(quote.get("cp"))
    if last_price is None:
        return None, None, None

    as_of = _market_now().strftime("%Y-%m-%d %H:%M")
    return last_price, prev_close, as_of


def _parse_candle_snapshot(candles, interval: str):
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
    as_of_format = "%Y-%m-%d %H:%M" if interval == "minute" else "%Y-%m-%d"
    as_of = df["Timestamp"].iloc[-1].strftime(as_of_format)
    return latest_close, prev_close, as_of


def _fetch_intraday_snapshot(isin: str):
    """Fetch current trading day latest 1-minute candle."""
    if not client:
        return None, None, None

    try:
        candles = client.get_intraday_candles(isin=isin, interval="minutes", count=1)
    except Exception:
        return None, None, None

    return _parse_candle_snapshot(candles, "minute")


def _fetch_latest_and_prev_close(isin: str):
    """Fetch live current price and daily previous close for P/L."""
    if not client:
        return None, None, None

    end_date = _market_now().date()
    daily_start_date = end_date - timedelta(days=20)
    minute_start_date = end_date - timedelta(days=5)

    ltp_price, ltp_prev_close, ltp_as_of = _fetch_ltp_snapshot(isin)
    if ltp_price is not None and ltp_prev_close is not None:
        return ltp_price, ltp_prev_close, ltp_as_of

    daily_close, daily_prev_close, daily_as_of = _fetch_close_snapshot(
        isin=isin,
        start_date=daily_start_date,
        end_date=end_date,
        interval="day",
    )
    if ltp_price is not None:
        prev_close = daily_prev_close if daily_prev_close is not None else daily_close
        return ltp_price, prev_close, ltp_as_of

    intraday_close, _, intraday_as_of = _fetch_intraday_snapshot(isin)
    if intraday_close is not None:
        prev_close = daily_close if daily_close is not None else intraday_close
        return intraday_close, prev_close, intraday_as_of

    minute_close, _, minute_as_of = _fetch_close_snapshot(
        isin=isin,
        start_date=minute_start_date,
        end_date=end_date,
        interval="minute",
    )

    if minute_close is None:
        prev_close = daily_prev_close if daily_prev_close is not None else daily_close
        return daily_close, prev_close, daily_as_of

    minute_date = minute_as_of[:10] if minute_as_of else None
    daily_date = daily_as_of[:10] if daily_as_of else None
    if daily_close is None:
        prev_close = minute_close
    elif minute_date and daily_date and minute_date == daily_date:
        prev_close = daily_prev_close if daily_prev_close is not None else daily_close
    else:
        prev_close = daily_close

    return minute_close, prev_close, minute_as_of


def _build_paper_portfolio_snapshot():
    cash_balance = PAPER_STORE.get_cash_balance()
    total_funded = PAPER_STORE.get_total_funded()
    holdings = PAPER_STORE.list_holdings()
    realized_pnl = PAPER_STORE.get_realized_pnl()
    stock_name_by_isin = {
        row["isin"]: row["name"] for row in PAPER_STORE.list_stocks(limit=2000)
    }
    instrument_meta = PAPER_STORE.get_instrument_metadata()

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
        position_day_pnl = qty * (mark_price - prev_price)

        invested_cost += cost_value
        market_value += current_value
        unrealized_pnl += position_unrealized
        day_pnl += position_day_pnl
        if as_of:
            price_as_of = as_of

        meta = instrument_meta.get(isin, {})
        name = meta.get("name") or stock_name_by_isin.get(isin, isin)
        expiry = meta.get("expiry")
        is_option = isin.startswith("NSE_FO|")

        positions.append(
            {
                "id": holding["id"],
                "isin": isin,
                "name": name,
                "expiry": expiry,
                "is_option": is_option,
                "quantity": round(qty, 6),
                "avg_price": round(avg_price, 4),
                "current_price": round(mark_price, 4),
                "prev_close": round(prev_price, 4),
                "cost_value": round(cost_value, 2),
                "market_value": round(current_value, 2),
                "unrealized_pnl": round(position_unrealized, 2),
                "day_pnl": round(position_day_pnl, 2),
                "updated_at": holding["updated_at"],
            }
        )

    positions.sort(key=lambda row: row["market_value"], reverse=True)

    equity = cash_balance + market_value
    total_pnl = unrealized_pnl
    pnl_vs_funded = equity - total_funded

    enriched_trades = []
    for trade in PAPER_STORE.list_trades(limit=100):
        isin = trade["isin"]
        meta = instrument_meta.get(isin, {})
        name = meta.get("name") or stock_name_by_isin.get(isin, isin)
        expiry = meta.get("expiry")
        is_option = isin.startswith("NSE_FO|")
        enriched_trades.append(
            {
                **dict(trade),
                "name": name,
                "expiry": expiry,
                "is_option": is_option,
            }
        )

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
        "trades": enriched_trades,
        "cash_flows": PAPER_STORE.list_ledger(limit=100),
    }


# API Routes
@app.get("/", tags=["UI"])
async def root():
    """Root endpoint – UI removed, API only."""
    dist_path = Path(__file__).resolve().parents[1] / "dist"
    index_file = dist_path / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
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


@app.get("/api/market-quote/ltp/{isin}", tags=["Stock Data"])
async def get_ltp_quote(isin: str):
    """Fetch current last traded price for a stock."""
    if not client:
        raise HTTPException(status_code=503, detail="Upstox API client not configured")

    price, prev_close, as_of = _fetch_ltp_snapshot(isin)
    source = "ltp"
    if price is None:
        daily_close, _, _ = _fetch_close_snapshot(
            isin=isin,
            start_date=_market_now().date() - timedelta(days=20),
            end_date=_market_now().date(),
            interval="day",
        )
        price, _, as_of = _fetch_intraday_snapshot(isin)
        prev_close = daily_close if daily_close is not None else price
        source = "intraday"

    if price is None:
        price, prev_close, as_of = _fetch_latest_and_prev_close(isin)
        source = "historical_candle"

    if price is None:
        raise HTTPException(status_code=404, detail="No current price found for this ISIN")

    return {
        "isin": isin,
        "last_price": round(price, 4),
        "prev_close": round(prev_close, 4) if prev_close is not None else None,
        "timestamp": as_of,
        "source": source,
    }


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
        # Fetch historical data
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
        headers = [
            "Timestamp",
            "Open",
            "High",
            "Low",
            "Close",
            "Volume",
            "Open Interest",
        ]
        df = pd.DataFrame(candles, columns=headers)

        # Train model and predict
        future_days = max(1, min(int(request.forecast_days or 1), 15))
        backtest_days = max(8, min(int(request.backtest_days or 30), 60))
        predictor = Prediction(df)
        predictor.feature_engineering()
        predictor.train_model(backtest_points=backtest_days)
        forecast = predictor.predict_next_day()
        future_forecast = predictor.predict_future_days(days=future_days)
        backtest = predictor.get_backtest_points(limit=backtest_days)
        backtest_summary = predictor.get_backtest_summary()
        diagnostics = predictor.get_diagnostics()
        signal = predictor.get_signal_snapshot(forecast)

        # Compatibility fields + richer payload
        predicted_high = float(forecast.get("predicted_high", 0.0))
        mae = float(forecast.get("mae", 0.0))
        mape = float(forecast.get("mape", 0.0))
        confidence = round(predictor.confidence_score(), 2)
        confidence_label = (
            "high" if confidence >= 75 else "moderate" if confidence >= 55 else "low"
        )

        result = {
            "isin": request.isin,
            "predicted_high": predicted_high,
            "p10": float(forecast.get("p10", predicted_high)),
            "p90": float(forecast.get("p90", predicted_high)),
            "mae": mae,
            "mape": mape,
            "rmse": float(forecast.get("rmse", 0.0)),
            "bias": float(forecast.get("bias", 0.0)),
            "confidence": confidence,
            "confidence_label": confidence_label,
            "forecast": forecast,
            "backtest": backtest,
            "backtest_summary": backtest_summary,
            "diagnostics": diagnostics,
            "future_forecast": future_forecast,
            "model_version": "walk_forward_ensemble_v2",
            **signal,
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

        if request.option_symbol:
            PAPER_STORE.set_instrument_metadata(
                isin=request.isin,
                name=request.option_symbol,
                expiry=request.option_expiry,
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


def _resolve_underlying_key(key: str) -> str:
    key_upper = key.strip().upper()
    if "|" in key:
        return key.strip()
    if key_upper in ["NIFTY", "NIFTY 50", "NIFTY_50"]:
        return "NSE_INDEX|Nifty 50"
    if key_upper in ["BANKNIFTY", "NIFTY BANK", "NIFTY_BANK"]:
        return "NSE_INDEX|Nifty Bank"

    # If it is a 12-character alphanumeric ISIN, look up the active trading symbol from Upstox
    if len(key_upper) == 12 and key_upper.isalnum():
        if client:
            try:
                results = client.search_instruments(
                    query=key_upper, exchange="NSE", segment="EQ"
                )
                if results and len(results) > 0:
                    return results[0]["instrument_key"]
            except Exception as e:
                print(f"Warning: Upstox Instrument Search failed for {key_upper}: {str(e)}")

    # Otherwise assume NSE equity symbol (if it's not an ISIN but e.g. "TCS")
    return f"NSE_EQ|{key.strip()}"


@app.get("/api/options/expiries/{underlying_key}", tags=["Options"])
async def get_options_expiries(underlying_key: str):
    """Fetch all unique option expiry dates for a given underlying."""
    if not client:
        raise HTTPException(status_code=503, detail="Upstox API client not configured")

    try:
        resolved_key = _resolve_underlying_key(underlying_key)
        contracts = client.get_option_contracts(resolved_key)
        expiries = sorted(list(set(c["expiry"] for c in contracts if "expiry" in c)))
        return {"underlying_key": resolved_key, "expiries": expiries}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch expiries: {str(e)}")


@app.get("/api/options/chain", tags=["Options"])
async def get_options_chain(underlying_key: str, expiry_date: str):
    """Fetch put/call option chain for a given underlying and expiry date."""
    if not client:
        raise HTTPException(status_code=503, detail="Upstox API client not configured")

    try:
        resolved_key = _resolve_underlying_key(underlying_key)
        chain_data = client.get_option_chain(resolved_key, expiry_date) or []

        try:
            contracts = client.get_option_contracts(resolved_key, expiry_date) or []
            lot_map = {
                c["instrument_key"]: c["lot_size"]
                for c in contracts
                if "instrument_key" in c and "lot_size" in c
            }
        except Exception:
            lot_map = {}

        for row in chain_data:
            if "call_options" in row and row["call_options"]:
                k = row["call_options"].get("instrument_key")
                row["call_options"]["lot_size"] = lot_map.get(k, 1)
            if "put_options" in row and row["put_options"]:
                k = row["put_options"].get("instrument_key")
                row["put_options"]["lot_size"] = lot_map.get(k, 1)

        return {"underlying_key": resolved_key, "expiry_date": expiry_date, "chain": chain_data}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to fetch option chain: {str(e)}",
        )


@app.get("/api/instruments/search", tags=["Reference"])
async def search_upstox_instruments(q: str):
    """Search for instruments in Upstox (live search)."""
    if not client:
        raise HTTPException(status_code=503, detail="Upstox API client not configured")
    try:
        results = client.search_instruments(query=q, exchange="NSE", segment="EQ")
        stocks = []
        for r in results:
            if r.get("isin"):
                stocks.append({
                    "isin": r["isin"],
                    "name": r.get("name") or r.get("trading_symbol") or "",
                    "trading_symbol": r.get("trading_symbol") or "",
                })
        return {"results": stocks}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to search Upstox instruments: {str(e)}",
        )


# Serve static files from the frontend build if it exists
dist_path = Path(__file__).resolve().parents[1] / "dist"
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path)), name="static")


