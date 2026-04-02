import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000"; // ← change to your backend URL

// `stocks` comes from backend. If data cannot be fetched, we show strict zero/default values.
function buildEmptyStockData(ticker) {
  return {
    ticker,
    name: ticker,
    history: [],
    backtest: [],
    predicted: [],
    lastPrice: 0,
    change: 0,
    changePct: 0,
    signal: "NO DATA",
    signalColor: "#778899",
    confidence: 0,
    riskScore: 0,
    trend: "Neutral",
    trendStrength: 0,
    indicators: { rsi: 0, macd: 0, ema20: 0, ema50: 0, volume: 0 },
  };
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  let normalized = value;
  if (Number.isFinite(numeric)) {
    // Support both epoch seconds and epoch milliseconds
    normalized = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric;
  }
  const date = new Date(normalized);
  const ts = date.getTime();
  return Number.isNaN(ts) ? null : ts;
}

function formatDateLabel(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toNumberOrNaN(value) {
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function firstFinite(values) {
  for (const v of values) {
    if (Number.isFinite(v)) return v;
  }
  return NaN;
}

function getCandleRows(histJson) {
  if (Array.isArray(histJson?.data)) return histJson.data;
  if (Array.isArray(histJson?.data?.candles)) return histJson.data.candles;
  if (Array.isArray(histJson?.candles)) return histJson.candles;
  return [];
}

function extractCandlePoint(row) {
  if (Array.isArray(row)) {
    const ts = normalizeTimestamp(row[0]);
    const numericRow = row.map(toNumberOrNaN);
    // Prefer canonical candle positions, then fallback to any plausible price-like number.
    const price = firstFinite([
      numericRow[4], // close (canonical)
      numericRow[2], // high (canonical)
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

// ── Sub-components ───────────────────────────────────────────────────────────
function SignalBadge({ signal, color }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
      {signal}
    </span>
  );
}

function RiskMeter({ score }) {
  const color = score < 35 ? "#00e5a0" : score < 65 ? "#facc15" : "#f87171";
  const label = score < 35 ? "LOW" : score < 65 ? "MEDIUM" : "HIGH";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#8899aa", letterSpacing: 1 }}>RISK SCORE</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ height: 6, background: "#1e2d3d", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg, #00e5a0, ${color})`, borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
      <div style={{ textAlign: "right", fontSize: 12, color, marginTop: 3, fontWeight: 600 }}>{score}/100</div>
    </div>
  );
}

function ConfidenceRing({ value }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#1e2d3d" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke="#00e5a0" strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#00e5a0", lineHeight: 1 }}>{value}%</span>
        <span style={{ fontSize: 9, color: "#556677", letterSpacing: 0.5 }}>CONF</span>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  
  const data = payload[0]?.payload;
  if (!data) return null;
  const displayLabel = Number.isFinite(Number(label)) ? formatDateLabel(Number(label)) : label;
  
  return (
    <div style={{ background: "#0d1a26", border: "1px solid #1e3a52", borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
      <div style={{ color: "#8899aa", marginBottom: 4 }}>{displayLabel}</div>
      {data.actual !== null && (
        <div style={{ color: "#4a9eff", fontWeight: 600 }}>
          Actual: ${data.actual}
        </div>
      )}
      {data.predicted !== null && (
        <div style={{ color: "#00e5a0", fontWeight: 600 }}>
          Forecast: ${data.predicted}
        </div>
      )}
      {data.lower !== null && data.upper !== null && (
        <div style={{ color: "#00e5a030", fontSize: 10, marginTop: 2 }}>
          Range: ${data.lower} - ${data.upper}
        </div>
      )}
    </div>
  );
};

function StockCard({ ticker, selected, data, onClick, name, meta }) {
  // allow rendering when only meta (server list) is available
  if (!data && !meta) return null;
  const up = (data?.changePct ?? 0) >= 0;
  const displayName = name || data?.name || ticker;
  const displayLast = meta?.last_price ?? data?.lastPrice ?? "—";
  return (
    <div onClick={onClick} style={{
      background: selected ? "linear-gradient(135deg, #0d2236 0%, #0f2940 100%)" : "#0a1520",
      border: `1px solid ${selected ? "#00e5a060" : "#1a2a3a"}`,
      borderRadius: 10, padding: "14px 16px", cursor: "pointer",
      transition: "all 0.2s", boxShadow: selected ? "0 0 20px #00e5a015" : "none"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: selected ? "#00e5a0" : "#cde" }}>{displayName}</div>
          <div style={{ fontSize: 10, color: "#556677", marginTop: 2 }}>{ticker}</div>
        </div>
        <SignalBadge signal={data?.signal} color={data?.signalColor} />
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, color: "#e8f4ff", fontWeight: 700 }}>${displayLast}</span>
        <span style={{ fontSize: 12, color: up ? "#4ade80" : "#f87171", fontWeight: 600 }}>{up ? "▲" : "▼"} {Math.abs(data?.changePct ?? 0)}%</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function StockDashboard() {
  const [stocks, setStocks] = useState([]);
  const [selected, setSelected] = useState("");
  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(false);
  const [remoteStocks, setRemoteStocks] = useState(null);

  // Fetch data for a ticker
  async function loadStock(ticker) {
    if (!ticker || stockData[ticker]) return;
    setLoading(true);
    try {
      // Always attempt to fetch historical + prediction data from backend
      const isin = ticker;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 180);
      const fmt = d => d.toISOString().slice(0, 10);

      const histResp = await fetch(`${API_BASE}/api/historical-candles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
      });
      if (!histResp.ok) throw new Error(`History fetch failed: ${histResp.status}`);
      const histJson = await histResp.json();

      const candleRows = getCandleRows(histJson);
      const rawHistory = candleRows
        .map((row, idx) => {
          const { ts, price } = extractCandlePoint(row);
          if (!Number.isFinite(price)) return null;
          return { idx, ts, price: +price.toFixed(2) };
        })
        .filter(Boolean);

      // Keep data even when some timestamps are invalid by synthesizing missing points.
      const historySeed = rawHistory
        .slice()
        .sort((a, b) => {
          if (a.ts === null && b.ts === null) return a.idx - b.idx;
          if (a.ts === null) return 1;
          if (b.ts === null) return -1;
          return a.ts - b.ts;
        });

      const historyBaseTs =
        historySeed.find((row) => row.ts !== null)?.ts ??
        (Date.now() - historySeed.length * 86400000);

      const history = historySeed
        .map((row, i) => {
          const ts = row.ts ?? (historyBaseTs + i * 86400000);
          return {
            ts,
            dateLabel: formatDateLabel(ts),
            price: row.price,
          };
        })
        .sort((a, b) => a.ts - b.ts);

      if (!history.length) {
        console.warn(`No usable historical points returned for ${ticker}`, candleRows?.[0]);
      }

      let predJson = {};
      try {
        const predResp = await fetch(`${API_BASE}/api/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: "day", count: 1 }),
        });
        if (predResp.ok) {
          predJson = await predResp.json();
        } else {
          console.warn(`Predict fetch failed for ${ticker}: ${predResp.status}`);
        }
      } catch (predErr) {
        console.warn(`Predict fetch error for ${ticker}:`, predErr);
      }

      const predictionContainer =
        predJson?.predicted_high && typeof predJson.predicted_high === "object"
          ? predJson.predicted_high
          : predJson;

      const predictedHigh = Number(predictionContainer?.predicted_high ?? predJson?.predicted_high);
      const intervalLow = Number(predictionContainer?.p10 ?? predJson?.p10);
      const intervalHigh = Number(predictionContainer?.p90 ?? predJson?.p90);

      const lastPrice = history.length
        ? history[history.length - 1].price
        : Number.isFinite(predictedHigh)
          ? predictedHigh
          : 0;

      const baseTs = history.length ? history[history.length - 1].ts : Date.now();
      let low = Number.isFinite(intervalLow) ? intervalLow : predictedHigh;
      let high = Number.isFinite(intervalHigh) ? intervalHigh : predictedHigh;
      if (Number.isFinite(low) && Number.isFinite(high) && low > high) {
        [low, high] = [high, low];
      }
      const predicted = Number.isFinite(predictedHigh)
        ? [{
            ts: baseTs + 86400000,
            dateLabel: formatDateLabel(baseTs + 86400000),
            price: +predictedHigh.toFixed(2),
            lower: +low.toFixed(2),
            upper: +high.toFixed(2),
          }]
        : [];

      const backtest = (predJson.backtest || [])
        .map((point) => {
          const ts = normalizeTimestamp(point.timestamp || point.date);
          const actualHigh = Number(point.actual_high ?? point.actual);
          const predictedValue = Number(point.predicted_high ?? point.predicted);
          if (ts === null || !Number.isFinite(actualHigh) || !Number.isFinite(predictedValue)) {
            return null;
          }
          return {
            ts,
            dateLabel: formatDateLabel(ts),
            actual: +actualHigh.toFixed(2),
            predicted: +predictedValue.toFixed(2),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts);

      const confidenceValue = Number(predJson.confidence);
      const confidence =
        Number.isFinite(confidenceValue)
          ? confidenceValue
          : predJson.confidence === "high"
            ? 80
            : predJson.confidence === "moderate"
              ? 50
              : 0;

      const dataObj = {
        ticker: isin,
        name: histJson.isin || isin,
        history,
        backtest,
        predicted,
        lastPrice: +lastPrice,
        change: history.length ? +(lastPrice - history[0].price).toFixed(2) : 0,
        changePct: history.length ? +(((lastPrice - history[0].price) / history[0].price) * 100).toFixed(2) : 0,
        signal: predJson.signal || 'NO DATA',
        signalColor: predJson.signalColor || '#778899',
        confidence,
        riskScore: Number.isFinite(+predJson.riskScore) ? +predJson.riskScore : 0,
        trend: predJson.trend || 'Neutral',
        trendStrength: Number.isFinite(+predJson.trendStrength) ? +predJson.trendStrength : 0,
        indicators: {
          rsi: Number.isFinite(+predJson.rsi) ? +predJson.rsi : 0,
          macd: Number.isFinite(+predJson.macd) ? +predJson.macd : 0,
          ema20: Number.isFinite(+predJson.ema20) ? +predJson.ema20 : 0,
          ema50: Number.isFinite(+predJson.ema50) ? +predJson.ema50 : 0,
          volume: predJson.volume ?? 0
        }
      };

      setStockData(d => ({ ...d, [ticker]: dataObj }));
    } catch (e) {
      console.error('Backend fetch failed, using zero-value fallback:', e);
      setStockData(d => ({ ...d, [ticker]: buildEmptyStockData(ticker) }));
    } finally {
      setLoading(false);
    }
  }

  // Fetch available stocks from backend on mount (and set initial selected ticker)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stocks`);
        if (!res.ok) throw new Error('Failed to fetch stocks');
        const json = await res.json();
        // Map to { ticker, name } (server commonly returns `isin`)
        const list = (json.stocks || []).map(s => ({
          ticker: s.isin || s.ticker || s.id,
          name: s.name || s.company || '',
          last_price: s.last_price ?? s.lastPrice ?? null,
        }));
        if (mounted) {
          setRemoteStocks(list);
          setStocks(list);
          if (list.length) setSelected(list[0].ticker);
        }
      } catch (err) {
        console.error('Error fetching remote stocks', err);
        // fallback to an empty list — UI will show nothing until backend is available
        setStocks([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => { loadStock(selected); }, [selected]);

  const data = stockData[selected];
  const meta = (remoteStocks || stocks).find(s => s.ticker === selected) || {};
  const todayPrice = meta.last_price ?? data?.lastPrice ?? null;
  const predictedVal = data?.predicted?.[0]?.price ?? null;
  
  // Chart should show only actual historical data for the last 15 days.
  const chartHistory = data?.history ? data.history.slice(-15) : [];
  const chartData = chartHistory.map((h) => ({
    ts: h.ts,
    dateLabel: h.dateLabel,
    actual: h.price,
  }));

  const trendColor = data?.trend === "Bullish" ? "#00e5a0" : data?.trend === "Bearish" ? "#f87171" : "#facc15";

  return (
    <div style={{
      minHeight: "100vh", background: "#060e17", color: "#cde", fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      display: "grid", gridTemplateColumns: "280px 1fr", gridTemplateRows: "60px 1fr"
    }}>
      {/* Header */}
      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", borderBottom: "1px solid #1a2a3a", background: "#07101a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img src="/logo.png" alt="ALGOOEE" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>Algooee</span>
            <span style={{ fontSize: 10, color: "#445566", marginLeft: 8, letterSpacing: 2 }}>STOCK INTELLIGENCE</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 11, color: "#445566" }}>DATA SOURCE</div>
          <div style={{
            background: "#1a2a3a", border: "1px solid #2a3a4a",
            color: "#778899", borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 1
          }}>
            LIVE API
          </div>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "pulse 2s infinite" }} />
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ borderRight: "1px solid #1a2a3a", padding: 16, overflowY: "auto", background: "#07101a" }}>
        <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 12, paddingLeft: 4 }}>WATCHLIST</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(remoteStocks || stocks).map(s => (
            <StockCard key={s.ticker} ticker={s.ticker} name={s.name} meta={s} selected={selected === s.ticker}
              data={stockData[s.ticker]} onClick={() => setSelected(s.ticker)} />
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ overflowY: "auto", padding: "24px 28px" }}>
        {loading && !data ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", color: "#445566", fontSize: 14 }}>
            Loading predictions…
          </div>
        ) : data ? (
          <>
            {/* Stock header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  {(() => {
                    const meta = (remoteStocks || stocks).find(s => s.ticker === selected) || {};
                    const displayName = meta.name || data?.name || selected;
                    return (
                      <>
                        <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, margin: 0, color: "#fff" }}>{displayName}</h1>
                        <span style={{ fontSize: 14, color: "#667788" }}>{selected}</span>
                      </>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, color: "#e8f4ff", fontWeight: 700 }}>${todayPrice ?? data?.lastPrice ?? "—"}</div>
                    <div style={{ fontSize: 12, color: "#8899aa", marginTop: 4 }}>
                      Today: {todayPrice ? `$${todayPrice}` : "—"} · Predicted: {predictedVal ? `$${predictedVal}` : "—"}
                    </div>
                  </div>
                  <span style={{ color: data?.changePct >= 0 ? "#4ade80" : "#f87171", fontSize: 14, fontWeight: 600 }}>
                    {data?.changePct >= 0 ? "▲" : "▼"} {Math.abs(data?.change ?? 0)} ({Math.abs(data?.changePct ?? 0)}%)
                  </span>
                  <span style={{ fontSize: 11, color: "#445566" }}>30D</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <ConfidenceRing value={data.confidence} />
                <div>
                  <SignalBadge signal={data.signal} color={data.signalColor} />
                  <div style={{ marginTop: 8, fontSize: 11, color: "#445566", textAlign: "right" }}>AI SIGNAL</div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: "20px 16px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingRight: 8 }}>
                <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>LAST 15 DAYS · ACTUAL PRICE</span>
                <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                  <span style={{ color: "#4a9eff" }}>── Actual</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1a2a3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="ts"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "#445566", fontSize: 10 }}
                    tickFormatter={(v) => formatDateLabel(Number(v))}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={chartHistory[chartHistory.length - 1]?.ts} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />
                  {/* Actual historical line */}
                  <Line 
                    type="linear" 
                    dataKey="actual" 
                    stroke="#4a9eff" 
                    strokeWidth={2} 
                    dot={chartData.length <= 120}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              {/* Trend */}
              <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 12 }}>TREND ANALYSIS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 22, color: trendColor, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{data.trend}</span>
                </div>
                <div style={{ fontSize: 11, color: "#556677", marginBottom: 6 }}>Strength</div>
                <div style={{ height: 6, background: "#1e2d3d", borderRadius: 3 }}>
                  <div style={{ width: `${data.trendStrength}%`, height: "100%", background: trendColor, borderRadius: 3, transition: "width 0.8s" }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: trendColor, marginTop: 3 }}>{data.trendStrength}%</div>
              </div>

              {/* Risk */}
              <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 12 }}>RISK ASSESSMENT</div>
                <RiskMeter score={data.riskScore} />
                <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#445566" }}>
                  <span>Low</span><span>Medium</span><span>High</span>
                </div>
              </div>

              {/* Confidence */}
              <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 12 }}>MODEL CONFIDENCE</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8 }}>
                  <ConfidenceRing value={data.confidence} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#00e5a0", fontFamily: "'Space Mono', monospace" }}>{data.confidence}%</div>
                    <div style={{ fontSize: 11, color: "#445566", marginTop: 4 }}>Prediction confidence</div>
                    <div style={{ fontSize: 11, color: data.confidence > 75 ? "#4ade80" : data.confidence > 55 ? "#facc15" : "#f87171", marginTop: 2 }}>
                      {data.confidence > 75 ? "● High confidence" : data.confidence > 55 ? "● Moderate" : "● Low confidence"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Indicators */}
            <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 16 }}>TECHNICAL INDICATORS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {[
                  { label: "RSI (14)", value: data.indicators.rsi, note: data.indicators.rsi > 70 ? "Overbought" : data.indicators.rsi < 30 ? "Oversold" : "Neutral", color: data.indicators.rsi > 70 ? "#f87171" : data.indicators.rsi < 30 ? "#4ade80" : "#facc15" },
                  { label: "MACD", value: data.indicators.macd, note: data.indicators.macd > 0 ? "Bullish" : "Bearish", color: data.indicators.macd > 0 ? "#4ade80" : "#f87171" },
                  { label: "EMA 20", value: `$${data.indicators.ema20}`, note: data.lastPrice > data.indicators.ema20 ? "Above" : "Below", color: data.lastPrice > data.indicators.ema20 ? "#4ade80" : "#f87171" },
                  { label: "EMA 50", value: `$${data.indicators.ema50}`, note: data.lastPrice > data.indicators.ema50 ? "Above" : "Below", color: data.lastPrice > data.indicators.ema50 ? "#4ade80" : "#f87171" },
                  { label: "Volume", value: data.indicators.volume, note: "Avg Daily", color: "#778899" },
                ].map(ind => (
                  <div key={ind.label} style={{ background: "#060e17", border: "1px solid #1a2a3a", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#445566", letterSpacing: 1, marginBottom: 6 }}>{ind.label}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: "#e8f4ff", marginBottom: 4 }}>{ind.value}</div>
                    <div style={{ fontSize: 10, color: ind.color, fontWeight: 600 }}>{ind.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #07101a; }
        ::-webkit-scrollbar-thumb { background: #1a2a3a; border-radius: 2px; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  );
}
