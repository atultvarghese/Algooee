from __future__ import annotations

# ruff: noqa: E402,I001

import argparse
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# pyrefly: ignore [missing-import]
from app.app import UpstoxClient


CANDLE_COLUMNS = [
    "Timestamp",
    "Open",
    "High",
    "Low",
    "Close",
    "Volume",
    "Open Interest",
]
UNDERLYING_ALIASES = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "NIFTY 50": "NSE_INDEX|Nifty 50",
    "NIFTY_50": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "NIFTY BANK": "NSE_INDEX|Nifty Bank",
    "NIFTY_BANK": "NSE_INDEX|Nifty Bank",
}
MARKET_TZ = timezone(timedelta(hours=5, minutes=30))


def parse_yyyy_mm_dd(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Date must be in YYYY-MM-DD format") from exc


def market_today() -> date:
    return datetime.now(MARKET_TZ).date()


def resolve_date_range(
    days: int = 30,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[date, date]:
    end = end_date or market_today()
    start = start_date or (end - timedelta(days=days))
    if start > end:
        raise ValueError("start_date must be earlier than or equal to end_date")
    return start, end


def candles_to_dataframe(candles: list[list]) -> pd.DataFrame:
    if not candles:
        return pd.DataFrame(columns=CANDLE_COLUMNS)

    df = pd.DataFrame(candles)
    extra_columns = [f"Extra_{idx}" for idx in range(1, max(0, df.shape[1] - 7) + 1)]
    columns = CANDLE_COLUMNS + extra_columns
    df = df.reindex(columns=range(len(columns)))
    df.columns = columns

    df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
    for column in CANDLE_COLUMNS[1:]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df.dropna(subset=["Timestamp"], inplace=True)
    df.sort_values("Timestamp", inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def resolve_underlying_key(client: UpstoxClient, underlying: str) -> str:
    underlying = underlying.strip()
    if "|" in underlying:
        return underlying

    alias = UNDERLYING_ALIASES.get(underlying.upper())
    if alias:
        return alias

    try:
        results = client.search_instruments(query=underlying, exchange="NSE", segment="EQ")
    except Exception:
        results = []

    if results:
        exact_match = next(
            (
                item
                for item in results
                if (item.get("trading_symbol") or "").upper() == underlying.upper()
                or (item.get("isin") or "").upper() == underlying.upper()
            ),
            results[0],
        )
        instrument_key = exact_match.get("instrument_key")
        if instrument_key:
            return instrument_key
        if exact_match.get("isin"):
            return f"NSE_EQ|{exact_match['isin']}"

    return f"NSE_EQ|{underlying}"


def nearest_expiry(contracts: list[dict[str, Any]], today: date | None = None) -> str:
    expiries = sorted(
        {contract.get("expiry") for contract in contracts if contract.get("expiry")}
    )
    if not expiries:
        raise ValueError("No option expiries returned for this underlying")

    today_str = (today or market_today()).isoformat()
    future_expiries = [expiry for expiry in expiries if expiry >= today_str]
    return future_expiries[0] if future_expiries else expiries[-1]


def _to_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number


def choose_option_row(
    chain: list[dict[str, Any]],
    *,
    strike: float | None = None,
) -> dict[str, Any]:
    if not chain:
        raise ValueError("No option chain rows returned")

    rows_with_strikes = [row for row in chain if _to_float(row.get("strike_price")) is not None]
    if not rows_with_strikes:
        raise ValueError("Option chain did not include strike prices")

    if strike is not None:
        return min(
            rows_with_strikes,
            key=lambda row: abs(float(row["strike_price"]) - float(strike)),
        )

    spot_price = next(
        (
            _to_float(row.get("underlying_spot_price"))
            for row in rows_with_strikes
            if _to_float(row.get("underlying_spot_price")) is not None
        ),
        None,
    )
    if spot_price is not None:
        return min(
            rows_with_strikes,
            key=lambda row: abs(float(row["strike_price"]) - spot_price),
        )

    rows_with_strikes.sort(key=lambda row: float(row["strike_price"]))
    return rows_with_strikes[len(rows_with_strikes) // 2]


def choose_option_contract(
    client: UpstoxClient,
    *,
    underlying: str,
    expiry_date: date | None = None,
    option_type: str = "CE",
    strike: float | None = None,
) -> dict[str, Any]:
    underlying_key = resolve_underlying_key(client, underlying)
    if expiry_date:
        expiry = expiry_date.isoformat()
        try:
            contracts = client.get_option_contracts(underlying_key, expiry_date=expiry)
        except Exception:
            contracts = []
    else:
        contracts = client.get_option_contracts(underlying_key)
        expiry = nearest_expiry(contracts)

    chain = client.get_option_chain(underlying_key, expiry)
    selected_row = choose_option_row(chain, strike=strike)
    option_key = "call_options" if option_type.upper() == "CE" else "put_options"
    option = selected_row.get(option_key) or {}
    instrument_key = option.get("instrument_key")
    if not instrument_key:
        raise ValueError(f"No {option_type.upper()} contract found for selected row")

    lot_size_by_key = {
        contract["instrument_key"]: contract["lot_size"]
        for contract in contracts
        if contract.get("instrument_key") and contract.get("lot_size")
    }

    return {
        "underlying_key": underlying_key,
        "expiry": expiry,
        "strike": selected_row.get("strike_price"),
        "option_type": option_type.upper(),
        "instrument_key": instrument_key,
        "trading_symbol": option.get("trading_symbol")
        or f"{underlying} {selected_row.get('strike_price')} {option_type.upper()}",
        "lot_size": option.get("lot_size") or lot_size_by_key.get(instrument_key),
    }


def fetch_option_history(
    *,
    underlying: str = "NIFTY",
    instrument_key: str | None = None,
    expiry_date: date | None = None,
    option_type: str = "CE",
    strike: float | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    interval: str = "minute",
    count: int = 5,
    days: int = 30,
    client: UpstoxClient | None = None,
) -> tuple[pd.DataFrame, dict[str, Any], date, date]:
    """
    Fetch historical candles for an option contract.

    Pass instrument_key to fetch an exact option contract, or provide underlying,
    expiry, strike and option_type to resolve a contract from the option chain.
    """
    upstox = client or UpstoxClient()
    start, end = resolve_date_range(days=days, start_date=start_date, end_date=end_date)

    if instrument_key:
        contract = {
            "underlying_key": underlying,
            "expiry": expiry_date.isoformat() if expiry_date else None,
            "strike": strike,
            "option_type": option_type.upper(),
            "instrument_key": instrument_key,
            "trading_symbol": instrument_key,
            "lot_size": None,
        }
    else:
        contract = choose_option_contract(
            upstox,
            underlying=underlying,
            expiry_date=expiry_date,
            option_type=option_type,
            strike=strike,
        )

    candles = upstox.get_historical_candles(
        isin=contract["instrument_key"],
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        interval=interval,
        count=count,
        exchange="NSE_FO",
    )
    df = candles_to_dataframe(candles)
    for column, value in reversed(
        [
            ("Underlying", contract["underlying_key"]),
            ("Expiry", contract["expiry"]),
            ("Strike", contract["strike"]),
            ("Option Type", contract["option_type"]),
            ("Instrument Key", contract["instrument_key"]),
            ("Trading Symbol", contract["trading_symbol"]),
            ("Lot Size", contract["lot_size"]),
        ]
    ):
        df.insert(0, column, value)

    return df, contract, start, end


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_")


def default_output_path(
    contract: dict[str, Any],
    interval: str,
    count: int,
    start_date: date,
    end_date: date,
) -> Path:
    output_dir = Path(__file__).resolve().parent / "outputs"
    filename = (
        f"option_{_slug(str(contract['trading_symbol']))}_{count}_{interval}_"
        f"{start_date.isoformat()}_to_{end_date.isoformat()}.csv"
    )
    return output_dir / filename


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch historical option candles using app.app.UpstoxClient."
    )
    parser.add_argument(
        "--underlying", default="NIFTY", help="NIFTY, BANKNIFTY, symbol, ISIN, or key"
    )
    parser.add_argument("--instrument-key", help="Exact option instrument key, e.g. NSE_FO|...")
    parser.add_argument(
        "--expiry-date", type=parse_yyyy_mm_dd, help="Option expiry in YYYY-MM-DD"
    )
    parser.add_argument("--type", choices=["CE", "PE"], default="CE", help="Option type")
    parser.add_argument("--strike", type=float, help="Preferred strike. Defaults to ATM")
    parser.add_argument(
        "--interval", default="minute", help="Candle unit, e.g. minute/day/month"
    )
    parser.add_argument(
        "--count", type=int, default=5, help="Number of interval units per candle"
    )
    parser.add_argument(
        "--days", type=int, default=30, help="Lookback days when start date is omitted"
    )
    parser.add_argument("--start-date", type=parse_yyyy_mm_dd, help="Start date in YYYY-MM-DD")
    parser.add_argument("--end-date", type=parse_yyyy_mm_dd, help="End date in YYYY-MM-DD")
    parser.add_argument(
        "--output", type=Path, help="CSV output path. Defaults to data_analysis/outputs"
    )
    parser.add_argument(
        "--no-save", action="store_true", help="Fetch and preview without writing CSV"
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    df, contract, start, end = fetch_option_history(
        underlying=args.underlying,
        instrument_key=args.instrument_key,
        expiry_date=args.expiry_date,
        option_type=args.type,
        strike=args.strike,
        start_date=args.start_date,
        end_date=args.end_date,
        interval=args.interval,
        count=args.count,
        days=args.days,
    )

    print(
        f"Fetched {len(df)} candles for {contract['trading_symbol']} "
        f"({contract['instrument_key']}, {args.count} {args.interval}, {start} to {end})"
    )

    if df.empty:
        print("No candles returned for this request.")
        return 1

    if not args.no_save:
        output_path = args.output or default_output_path(
            contract, args.interval, args.count, start, end
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(output_path, index=False)
        print(f"Saved CSV: {output_path}")

    print(df.tail())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
