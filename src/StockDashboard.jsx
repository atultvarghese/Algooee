import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000"; // ← change to your backend URL

const MOCK_STOCKS = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Automotive" },
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors" },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Technology" },
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "E-Commerce" },
];

function generateMockData(ticker) {
  const seed = ticker.charCodeAt(0);
  const base = 100 + seed * 1.5;
  const history = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: +(base + Math.sin(i * 0.4 + seed) * 15 + i * 0.3 + Math.random() * 4).toFixed(2),
  }));
  const lastPrice = history[history.length - 1].price;
  const predicted = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() + (i + 1) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: +(lastPrice + (Math.random() - 0.4) * 5 + i * 0.8).toFixed(2),
    lower: +(lastPrice + (Math.random() - 0.6) * 5 + i * 0.4 - 3).toFixed(2),
    upper: +(lastPrice + (Math.random() - 0.2) * 5 + i * 1.2 + 3).toFixed(2),
  }));
  const signal = ["STRONG BUY", "BUY", "HOLD", "SELL"][Math.floor(seed % 4)];
  const signalColor = { "STRONG BUY": "#00e5a0", "BUY": "#4ade80", "HOLD": "#facc15", "SELL": "#f87171" };
  const rsi = +(40 + seed % 40 + Math.random() * 10).toFixed(1);
  const macd = +((Math.random() - 0.5) * 4).toFixed(3);
  return {
    ticker,
    history,
    predicted,
    lastPrice,
    change: +(lastPrice - history[0].price).toFixed(2),
    changePct: +(((lastPrice - history[0].price) / history[0].price) * 100).toFixed(2),
    signal,
    signalColor: signalColor[signal],
    confidence: +(65 + seed % 25 + Math.random() * 5).toFixed(1),
    riskScore: +(20 + seed % 60 + Math.random() * 10).toFixed(1),
    trend: seed % 3 === 0 ? "Bearish" : seed % 3 === 1 ? "Neutral" : "Bullish",
    trendStrength: +(40 + seed % 50 + Math.random() * 10).toFixed(1),
    indicators: { rsi, macd, ema20: +(lastPrice * 0.98).toFixed(2), ema50: +(lastPrice * 0.95).toFixed(2), volume: `${(seed * 1.2 + 12).toFixed(1)}M` },
  };
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
  return (
    <div style={{ background: "#0d1a26", border: "1px solid #1e3a52", borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
      <div style={{ color: "#8899aa", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#00e5a0", fontWeight: 600 }}>
          {p.name}: ${p.value}
        </div>
      ))}
    </div>
  );
};

function StockCard({ ticker, selected, data, onClick }) {
  if (!data) return null;
  const up = data.changePct >= 0;
  return (
    <div onClick={onClick} style={{
      background: selected ? "linear-gradient(135deg, #0d2236 0%, #0f2940 100%)" : "#0a1520",
      border: `1px solid ${selected ? "#00e5a060" : "#1a2a3a"}`,
      borderRadius: 10, padding: "14px 16px", cursor: "pointer",
      transition: "all 0.2s", boxShadow: selected ? "0 0 20px #00e5a015" : "none"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: selected ? "#00e5a0" : "#cde" }}>{ticker}</div>
          <div style={{ fontSize: 10, color: "#556677", marginTop: 2 }}>{data.name || ""}</div>
        </div>
        <SignalBadge signal={data.signal} color={data.signalColor} />
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, color: "#e8f4ff", fontWeight: 700 }}>${data.lastPrice}</span>
        <span style={{ fontSize: 12, color: up ? "#4ade80" : "#f87171", fontWeight: 600 }}>{up ? "▲" : "▼"} {Math.abs(data.changePct)}%</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function StockDashboard() {
  const [stocks] = useState(MOCK_STOCKS);
  const [selected, setSelected] = useState("AAPL");
  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiMode, setApiMode] = useState(false); // toggle between mock and real API
  const [remoteStocks, setRemoteStocks] = useState(null);

  // Fetch or generate data for a ticker
  async function loadStock(ticker) {
    if (stockData[ticker]) return;
    setLoading(true);
    try {
      if (apiMode) {
        // In api mode we expect the "ticker" to be the ISIN (or remote mapping will set it)
        const isin = ticker;
        // Prepare date range: last 30 days
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        const fmt = d => d.toISOString().slice(0, 10);

        const histResp = await fetch(`/api/historical-candles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
        });
        if (!histResp.ok) throw new Error(`History fetch failed: ${histResp.status}`);
        const histJson = await histResp.json();

        // Map server candle data -> history array with date & price (use Close)
        // Server returns `data` as list of lists: [Timestamp, Open, High, Low, Close, Volume, Open Interest]
        const history = (histJson.data || []).map(row => ({
          date: new Date(row[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          price: +row[4]
        }));

        // Prediction endpoint
        const predResp = await fetch(`/api/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
        });
        if (!predResp.ok) throw new Error(`Predict fetch failed: ${predResp.status}`);
        const predJson = await predResp.json();

        // Build a simple 7-day predicted series using predicted_high
        const lastPrice = history.length ? history[history.length - 1].price : predJson.predicted_high;
        const predicted = Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() + (i + 1) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          price: +(predJson.predicted_high + i * 0.1).toFixed(2),
          lower: +(predJson.predicted_high - 1.5).toFixed(2),
          upper: +(predJson.predicted_high + 1.5).toFixed(2),
        }));

        const dataObj = {
          ticker: isin,
          name: histJson.isin || isin,
          history,
          predicted,
          lastPrice: +lastPrice,
          change: history.length ? +(lastPrice - history[0].price).toFixed(2) : 0,
          changePct: history.length ? +(((lastPrice - history[0].price) / history[0].price) * 100).toFixed(2) : 0,
          signal: predJson.confidence || 'HOLD',
          signalColor: predJson.confidence === 'high' ? '#00e5a0' : '#facc15',
          confidence: predJson.confidence === 'high' ? 80 : 50,
          riskScore: 50,
          trend: 'Neutral',
          trendStrength: 50,
          indicators: { rsi: 50, macd: 0, ema20: +(lastPrice * 0.98).toFixed(2), ema50: +(lastPrice * 0.95).toFixed(2), volume: 'N/A' }
        };

        setStockData(d => ({ ...d, [ticker]: dataObj }));
      } else {
        await new Promise(r => setTimeout(r, 300));
        setStockData(d => ({ ...d, [ticker]: generateMockData(ticker) }));
      }
    } catch (e) {
      console.error(e);
      setStockData(d => ({ ...d, [ticker]: generateMockData(ticker) }));
    } finally {
      setLoading(false);
    }
  }

  // When switching to API mode, fetch available stocks from backend
  useEffect(() => {
    if (!apiMode) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/stocks`);
        if (!res.ok) throw new Error('Failed to fetch stocks');
        const json = await res.json();
        // Map to { ticker, name }
        const list = (json.stocks || []).map(s => ({ ticker: s.isin, name: s.name }));
        if (mounted) {
          setRemoteStocks(list);
          if (list.length) setSelected(list[0].ticker);
        }
      } catch (err) {
        console.error('Error fetching remote stocks', err);
      }
    })();
    return () => { mounted = false; };
  }, [apiMode]);

  useEffect(() => { loadStock(selected); }, [selected]);
  // Pre-load all on mount (use remote stocks if available when apiMode is true)
  useEffect(() => { 
    const list = (apiMode && remoteStocks) ? remoteStocks : stocks;
    list.forEach(s => loadStock(s.ticker));
  }, [remoteStocks]);

  const data = stockData[selected];
  const chartData = data ? [
    ...data.history.map(h => ({ date: h.date, actual: h.price })),
    ...data.predicted.map(p => ({ date: p.date, predicted: p.price, lower: p.lower, upper: p.upper })),
  ] : [];
  const splitIdx = data ? data.history.length - 1 : 0;

  const trendColor = data?.trend === "Bullish" ? "#00e5a0" : data?.trend === "Bearish" ? "#f87171" : "#facc15";

  return (
    <div style={{
      minHeight: "100vh", background: "#060e17", color: "#cde", fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      display: "grid", gridTemplateColumns: "280px 1fr", gridTemplateRows: "60px 1fr"
    }}>
      {/* Header */}
      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", borderBottom: "1px solid #1a2a3a", background: "#07101a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #00e5a0, #0077ff)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16 }}>📈</span>
          </div>
          <div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>PredictIQ</span>
            <span style={{ fontSize: 10, color: "#445566", marginLeft: 8, letterSpacing: 2 }}>STOCK INTELLIGENCE</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 11, color: "#445566" }}>DATA SOURCE</div>
          <button onClick={() => setApiMode(m => !m)} style={{
            background: apiMode ? "#00e5a022" : "#1a2a3a", border: `1px solid ${apiMode ? "#00e5a0" : "#2a3a4a"}`,
            color: apiMode ? "#00e5a0" : "#778899", borderRadius: 20, padding: "4px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600, letterSpacing: 1
          }}>
            {apiMode ? "⚡ LIVE API" : "◎ MOCK DATA"}
          </button>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "pulse 2s infinite" }} />
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ borderRight: "1px solid #1a2a3a", padding: 16, overflowY: "auto", background: "#07101a" }}>
        <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 12, paddingLeft: 4 }}>WATCHLIST</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(apiMode && remoteStocks ? remoteStocks : stocks).map(s => (
            <StockCard key={s.ticker} ticker={s.ticker} selected={selected === s.ticker}
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
                  <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, margin: 0, color: "#fff" }}>{data.ticker}</h1>
                  <span style={{ fontSize: 14, color: "#667788" }}>{(remoteStocks || MOCK_STOCKS).find(s => s.ticker === selected)?.name}</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, color: "#e8f4ff", fontWeight: 700 }}>${data.lastPrice}</span>
                  <span style={{ color: data.changePct >= 0 ? "#4ade80" : "#f87171", fontSize: 14, fontWeight: 600 }}>
                    {data.changePct >= 0 ? "▲" : "▼"} {Math.abs(data.change)} ({Math.abs(data.changePct)}%)
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
                <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>PRICE HISTORY & 7-DAY PREDICTION</span>
                <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                  <span style={{ color: "#4a9eff" }}>── Actual</span>
                  <span style={{ color: "#00e5a0" }}>── Predicted</span>
                  <span style={{ color: "#00e5a030" }}>▓ Confidence Band</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00e5a0" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#00e5a0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a2a3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={chartData[splitIdx]?.date} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="#00e5a0" fillOpacity={0.07} />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="#060e17" fillOpacity={1} />
                  <Line type="monotone" dataKey="actual" stroke="#4a9eff" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="predicted" stroke="#00e5a0" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls />
                </AreaChart>
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
