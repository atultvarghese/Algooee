import { toNumberOrNaN } from "./formatters";

export function normalizeTimestamp(value) {
  const numeric = Number(value);
  let normalized = value;
  if (Number.isFinite(numeric)) {
    normalized = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric;
  }
  const date = new Date(normalized);
  const ts = date.getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function firstFinite(values) {
  for (const v of values) {
    if (Number.isFinite(v)) return v;
  }
  return NaN;
}

export function getCandleRows(histJson) {
  if (Array.isArray(histJson?.data)) return histJson.data;
  if (Array.isArray(histJson?.data?.candles)) return histJson.data.candles;
  if (Array.isArray(histJson?.candles)) return histJson.candles;
  return [];
}

export function extractCandlePoint(row) {
  if (Array.isArray(row)) {
    const ts = normalizeTimestamp(row[0]);
    const numericRow = row.map(toNumberOrNaN);
    const price = firstFinite([
      numericRow[4], // close
      numericRow[2], // high
      numericRow[1], // open
      numericRow[3], // low
      ...numericRow.filter(Number.isFinite),
    ]);
    return { ts, price };
  }

  if (row && typeof row === "object") {
    const ts = normalizeTimestamp(
      row.timestamp ?? row.time ?? row.date ?? row.datetime ?? row.candle_time
    );
    const price = firstFinite([
      toNumberOrNaN(row.close ?? row.Close ?? row.c ?? row.close_price ?? row.last_price ?? row.price ?? row.ltp),
      toNumberOrNaN(row.high ?? row.High ?? row.h ?? row.high_price),
      toNumberOrNaN(row.open ?? row.Open ?? row.o),
      toNumberOrNaN(row.low ?? row.Low ?? row.l),
    ]);
    return { ts, price };
  }
  return { ts: null, price: NaN };
}

export function buildEmptyStockData(ticker) {
  return {
    ticker, name: ticker, history: [], backtest: [], predicted: [],
    lastPrice: 0, change: 0, changePct: 0, confidence: 0,
    mae: null, mape: null, p10: null, p90: null, errorRatioPct: null,
    riskScore: 0, trend: "Neutral", trendStrength: 0,
    indicators: { rsi: 0, macd: 0, ema20: 0, ema50: 0, volume: 0 },
  };
}