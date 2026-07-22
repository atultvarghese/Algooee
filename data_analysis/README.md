# Data Analysis Fetch Scripts

This folder contains small command-line scripts for downloading historical candle data through the existing `app.app.UpstoxClient` wrapper.

The scripts return candles as pandas DataFrames and save CSV files to `data_analysis/outputs/` by default.

## Requirements

Create a `.env` file in the project root with Upstox tokens:

```bash
UPSTOX_API_TOKEN=your_upstox_api_token_here
UPSTOX_ANALYTICS_TOKEN=your_upstox_api_token_here
```

`UPSTOX_API_TOKEN` is used for historical candle data. `UPSTOX_ANALYTICS_TOKEN` is used by the option contract and option chain helpers.

Run commands from the project root:

```bash
cd Algoooeee
```

## Stock Historical Data

Script:

```bash
python data_analysis/fetch_stock_history.py
```

Default example fetches Reliance Industries using `NSE_EQ|INE002A01018`.

Fetch 5-minute candles for the last 30 days:

```bash
python data_analysis/fetch_stock_history.py \
  --instrument 'NSE_EQ|INE002A01018' \
  --interval minute \
  --count 5 \
  --days 30
```

Fetch a custom date range:

```bash
python data_analysis/fetch_stock_history.py \
  --instrument 'NSE_EQ|INE002A01018' \
  --interval minute \
  --count 5 \
  --start-date 2026-06-08 \
  --end-date 2026-07-08
```

You can pass either a full Upstox instrument key, such as `NSE_EQ|INE002A01018`, or a bare ISIN with `--exchange NSE_EQ`.

## Options Historical Data

Script:

```bash
python data_analysis/fetch_options_history.py
```

By default, it uses `NIFTY`, selects the nearest available expiry, picks the ATM call option, then fetches candles for that option instrument.

Fetch 5-minute NIFTY CE candles for the last 30 days:

```bash
python data_analysis/fetch_options_history.py \
  --underlying NIFTY \
  --type CE \
  --interval minute \
  --count 5 \
  --days 30
```

Fetch a specific expiry and strike:

```bash
python data_analysis/fetch_options_history.py \
  --underlying NIFTY \
  --expiry-date 2026-07-30 \
  --strike 23900 \
  --type CE \
  --interval minute \
  --count 5 \
  --days 30
```

Fetch an exact option instrument key:

```bash
python data_analysis/fetch_options_history.py \
  --instrument-key 'NSE_FO|your_option_instrument_key' \
  --interval minute \
  --count 5 \
  --days 30
```

Supported underlying shortcuts include:

- `NIFTY`
- `BANKNIFTY`
- Full underlying keys, such as `NSE_INDEX|Nifty 50`
- Stock symbols, ISINs, or full equity keys

## Output

Both scripts save CSV files into:

```text
data_analysis/outputs/
```

Stock output names look like:

```text
stock_NSE_EQ_INE002A01018_5_minute_2026-06-08_to_2026-07-08.csv
```

Option output names look like:

```text
option_NIFTY_23900.0_CE_5_minute_2026-06-08_to_2026-07-08.csv
```

Use `--output` to choose a custom path, or `--no-save` to preview without writing a CSV.

## Candle Columns

The candle columns match the Upstox response shape used across this repo:

- `Timestamp`
- `Open`
- `High`
- `Low`
- `Close`
- `Volume`
- `Open Interest`

The options script also prepends contract metadata columns such as `Underlying`, `Expiry`, `Strike`, `Option Type`, `Instrument Key`, `Trading Symbol`, and `Lot Size`.

## Helpful Commands

Show stock script options:

```bash
python data_analysis/fetch_stock_history.py --help
```

Show options script options:

```bash
python data_analysis/fetch_options_history.py --help
```
