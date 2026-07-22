from __future__ import annotations

# ruff: noqa: E402,I001

import argparse
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

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
DEFAULT_INSTRUMENT = "NSE_EQ|INE002A01018"  # Reliance Industries
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


def fetch_stock_history(
    instrument: str = DEFAULT_INSTRUMENT,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    interval: str = "minute",
    count: int = 5,
    days: int = 30,
    exchange: str = "NSE_EQ",
    client: UpstoxClient | None = None,
) -> tuple[pd.DataFrame, date, date]:
    """
    Fetch historical candles for a normal stock/equity instrument.

    Use a full Upstox instrument key such as NSE_EQ|INE002A01018, or pass only
    the ISIN and keep exchange as NSE_EQ.
    """
    start, end = resolve_date_range(days=days, start_date=start_date, end_date=end_date)
    upstox = client or UpstoxClient()
    candles = upstox.get_historical_candles(
        isin=instrument,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        interval=interval,
        count=count,
        exchange=exchange,
    )
    return candles_to_dataframe(candles), start, end


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_")


def default_output_path(
    instrument: str,
    interval: str,
    count: int,
    start_date: date,
    end_date: date,
) -> Path:
    output_dir = Path(__file__).resolve().parent / "outputs"
    filename = (
        f"stock_{_slug(instrument)}_{count}_{interval}_"
        f"{start_date.isoformat()}_to_{end_date.isoformat()}.csv"
    )
    return output_dir / filename


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch historical stock candles using app.app.UpstoxClient."
    )
    parser.add_argument(
        "--instrument",
        default=DEFAULT_INSTRUMENT,
        help="Stock ISIN or full instrument key. Default: Reliance NSE_EQ|INE002A01018",
    )
    parser.add_argument("--exchange", default="NSE_EQ", help="Exchange used for bare ISINs")
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
    df, start, end = fetch_stock_history(
        instrument=args.instrument,
        start_date=args.start_date,
        end_date=args.end_date,
        interval=args.interval,
        count=args.count,
        days=args.days,
        exchange=args.exchange,
    )

    print(
        f"Fetched {len(df)} candles for {args.instrument} "
        f"({args.count} {args.interval}, {start} to {end})"
    )

    if df.empty:
        print("No candles returned for this request.")
        return 1

    if not args.no_save:
        output_path = args.output or default_output_path(
            args.instrument, args.interval, args.count, start, end
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(output_path, index=False)
        print(f"Saved CSV: {output_path}")

    print(df.tail())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
