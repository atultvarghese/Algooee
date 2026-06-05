export function buildEmptyStockData(ticker) {
  return {
    ticker,
    name: ticker,
    history: [],
    backtest: [],
    backtestSummary: {},
    diagnostics: {},
    predicted: [],
    lastPrice: null,
    change: null,
    changePct: null,
    confidence: null,
    confidenceLabel: "none",
    mae: null,
    mape: null,
    rmse: null,
    bias: null,
    p10: null,
    p90: null,
    errorRatioPct: null,
    expectedMovePct: null,
    riskScore: null,
    trend: "—",
    trendStrength: null,
    indicators: { rsi: null, macd: null, ema20: null, ema50: null, volume: null },
  };
}

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

export function toNumberOrNaN(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "");
    if (cleaned === "") return NaN;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
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
      numericRow[4], numericRow[2], numericRow[1], numericRow[3],
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
