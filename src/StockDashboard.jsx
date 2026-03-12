import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000"; // ← change to your backend URL

// `stocks` now comes exclusively from the backend; no built-in mock list.

function generateMockData(ticker) {
  const seed = ticker.charCodeAt(0) + ticker.charCodeAt(ticker.length - 1);
  const base = 50 + (seed % 200); // More varied base prices
  const volatility = 0.02 + (seed % 10) * 0.005; // Realistic volatility
  const trend = (seed % 3) - 1; // -1 to 1 trend factor
  
  // Generate 60 days of historical data for better chart
  const history = [];
  let currentPrice = base;
  
  for (let i = 59; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    // Add some realistic market patterns: weekday effects, random walk with trend
    const dayOfWeek = date.getDay();
    const weekdayFactor = (dayOfWeek === 1 || dayOfWeek === 5) ? 0.002 : 0; // Slight Monday/Friday effect
    const randomChange = (Math.random() - 0.5) * volatility * currentPrice;
    const trendChange = trend * 0.001 * currentPrice;
    
    currentPrice += randomChange + trendChange + weekdayFactor * currentPrice;
    currentPrice = Math.max(currentPrice, base * 0.5); // Floor price
    
    history.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: +currentPrice.toFixed(2),
      volume: Math.floor((seed * 100000 + Math.random() * 500000) + 1000000) // Realistic volume
    });
  }
  
  const lastPrice = history[history.length - 1].price;
  
  // Generate 14-day predictions with confidence intervals
  const predicted = [];
  let predPrice = lastPrice;
  const predVolatility = volatility * 1.2; // Predictions are more uncertain
  
  for (let i = 0; i < 14; i++) {
    const date = new Date(Date.now() + (i + 1) * 86400000);
    const randomChange = (Math.random() - 0.5) * predVolatility * predPrice;
    const trendChange = trend * 0.0005 * predPrice; // Weaker trend in predictions
    
    predPrice += randomChange + trendChange;
    predPrice = Math.max(predPrice, lastPrice * 0.7); // Don't crash too much
    
    const confidence = Math.max(20, 80 - i * 3); // Confidence decreases over time
    const stdDev = (predVolatility * predPrice) * (1 + i * 0.1);
    
    predicted.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: +predPrice.toFixed(2),
      lower: +(predPrice - stdDev * 1.96).toFixed(2), // 95% confidence interval
      upper: +(predPrice + stdDev * 1.96).toFixed(2),
      confidence: confidence
    });
  }
  
  // Calculate realistic technical indicators
  const prices = history.map(h => h.price);
  const gains = [], losses = [];
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i-1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
  const rs = avgGain / avgLoss;
  const rsi = +(100 - (100 / (1 + rs))).toFixed(1);
  
  // Simple MACD calculation (EMA12 - EMA26)
  const ema12 = prices.slice(-12).reduce((a, b) => a + b, 0) / 12;
  const ema26 = prices.slice(-26).reduce((a, b) => a + b, 0) / 26;
  const macd = +(ema12 - ema26).toFixed(3);
  
  // EMAs
  const ema20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ema50 = prices.slice(-50).reduce((a, b) => a + b, 0) / 50;
  
  // Volume average
  const avgVolume = history.slice(-20).reduce((sum, h) => sum + h.volume, 0) / 20;
  const volumeStr = avgVolume > 1000000 ? `${(avgVolume / 1000000).toFixed(1)}M` : `${(avgVolume / 1000).toFixed(0)}K`;
  
  const signal = rsi > 70 ? "SELL" : rsi < 30 ? "BUY" : macd > 0 && lastPrice > ema20 ? "STRONG BUY" : macd < 0 && lastPrice < ema20 ? "SELL" : "HOLD";
  const signalColor = { "STRONG BUY": "#00e5a0", "BUY": "#4ade80", "HOLD": "#facc15", "SELL": "#f87171" };
  
  const confidence = Math.min(95, Math.max(45, 70 + (seed % 20) - Math.abs(trend) * 10));
  const riskScore = Math.min(90, Math.max(10, 50 + (volatility * 1000) + Math.abs(trend) * 20));
  const trendLabel = trend > 0.3 ? "Bullish" : trend < -0.3 ? "Bearish" : "Neutral";
  const trendStrength = Math.abs(trend) * 100;
  
  return {
    ticker,
    history,
    predicted,
    lastPrice,
    change: +(lastPrice - history[0].price).toFixed(2),
    changePct: +(((lastPrice - history[0].price) / history[0].price) * 100).toFixed(2),
    signal,
    signalColor: signalColor[signal],
    confidence,
    riskScore,
    trend: trendLabel,
    trendStrength,
    indicators: { rsi, macd, ema20: +ema20.toFixed(2), ema50: +ema50.toFixed(2), volume: volumeStr },
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
  
  const data = payload[0]?.payload;
  if (!data) return null;
  
  return (
    <div style={{ background: "#0d1a26", border: "1px solid #1e3a52", borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
      <div style={{ color: "#8899aa", marginBottom: 4 }}>{label}</div>
      {data.actual !== null && (
        <div style={{ color: "#4a9eff", fontWeight: 600 }}>
          Actual: ${data.actual}
        </div>
      )}
      {data.predicted !== null && (
        <div style={{ color: "#00e5a0", fontWeight: 600 }}>
          Predicted: ${data.predicted}
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
  const [apiMode, setApiMode] = useState(false); // toggle between mock and real API
  const [remoteStocks, setRemoteStocks] = useState(null);

  // Fetch or generate data for a ticker
  async function loadStock(ticker) {
    if (stockData[ticker]) return;
    setLoading(true);
    try {
      // Always attempt to fetch historical + prediction data from backend
      const isin = ticker;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const fmt = d => d.toISOString().slice(0, 10);

      const histResp = await fetch(`${API_BASE}/api/historical-candles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
      });
      if (!histResp.ok) throw new Error(`History fetch failed: ${histResp.status}`);
      const histJson = await histResp.json();

      let history = (histJson.data || []).map(row => ({
        date: new Date(row[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: +row[4]
      }));
      // Ensure history is chronological (oldest -> newest) so lastPrice is the latest value
      if (history.length > 1) {
        const firstTs = new Date(history[0].date).getTime();
        const lastTs = new Date(history[history.length - 1].date).getTime();
        if (firstTs > lastTs) history = history.slice().reverse();
      }

      const predResp = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
      });
      if (!predResp.ok) throw new Error(`Predict fetch failed: ${predResp.status}`);
      const predJson = await predResp.json();

      const lastPrice = history.length ? history[history.length - 1].price : predJson.predicted_high || 0;
      const predicted = Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: +(predJson.predicted_high + i * 0.1 || lastPrice + i * 0.1).toFixed(2),
        lower: +(predJson.predicted_high - 1.5 || lastPrice - 1.5).toFixed(2),
        upper: +(predJson.predicted_high + 1.5 || lastPrice + 1.5).toFixed(2),
      }));

      const dataObj = {
        ticker: isin,
        name: histJson.isin || isin,
        history,
        predicted,
        lastPrice: +lastPrice,
        change: history.length ? +(lastPrice - history[0].price).toFixed(2) : 0,
        changePct: history.length ? +(((lastPrice - history[0].price) / history[0].price) * 100).toFixed(2) : 0,
        signal: predJson.signal || 'HOLD',
        signalColor: predJson.confidence === 'high' ? '#00e5a0' : '#facc15',
        confidence: typeof predJson.confidence === 'number' ? predJson.confidence : (predJson.confidence === 'high' ? 80 : 50),
        riskScore: predJson.riskScore || 50,
        trend: predJson.trend || 'Neutral',
        trendStrength: predJson.trendStrength || 50,
        indicators: { rsi: predJson.rsi || 50, macd: predJson.macd || 0, ema20: +(lastPrice * 0.98).toFixed(2), ema50: +(lastPrice * 0.95).toFixed(2), volume: predJson.volume || 'N/A' }
      };

      setStockData(d => ({ ...d, [ticker]: dataObj }));
    } catch (e) {
      console.error('Backend fetch failed, falling back to mock:', e);
      setStockData(d => ({ ...d, [ticker]: generateMockData(ticker) }));
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
        if (mounted && list.length) {
          setRemoteStocks(list);
          setStocks(list);
          setSelected(list[0].ticker);
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
  // Pre-load all on mount (use remote stocks when available)
  useEffect(() => { 
    const list = remoteStocks || stocks;
    list.forEach(s => loadStock(s.ticker));
  }, [remoteStocks]);

  const data = stockData[selected];
  const meta = (remoteStocks || stocks).find(s => s.ticker === selected) || {};
  const todayPrice = meta.last_price ?? data?.lastPrice ?? null;
  const predictedVal = data?.predicted?.[0]?.price ?? null;
  
  // Create chart data with proper structure for historical and predicted data
  const chartData = data ? [
    // Historical data points
    ...data.history.map(h => ({ 
      date: h.date, 
      actual: h.price, 
      predicted: null, 
      lower: null, 
      upper: null,
      isHistorical: true 
    })),
    // Predicted data points
    ...data.predicted.map(p => ({ 
      date: p.date, 
      actual: null, 
      predicted: p.price, 
      lower: p.lower, 
      upper: p.upper,
      isHistorical: false 
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date)) : []; // Ensure chronological order
  
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
                <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>PRICE HISTORY & 14-DAY PREDICTION</span>
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
                  <XAxis dataKey="date" tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 8)} />
                  <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={data.history[data.history.length - 1]?.date} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />
                  {/* Confidence band - only for predicted data */}
                  <Area 
                    type="monotone" 
                    dataKey="upper" 
                    stroke="none" 
                    fill="#00e5a0" 
                    fillOpacity={0.07} 
                    connectNulls={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="lower" 
                    stroke="none" 
                    fill="#060e17" 
                    fillOpacity={1} 
                    connectNulls={false}
                  />
                  {/* Historical price line */}
                  <Line 
                    type="monotone" 
                    dataKey="actual" 
                    stroke="#4a9eff" 
                    strokeWidth={2} 
                    dot={false} 
                    connectNulls={false}
                  />
                  {/* Predicted price line */}
                  <Line 
                    type="monotone" 
                    dataKey="predicted" 
                    stroke="#00e5a0" 
                    strokeWidth={2} 
                    dot={false} 
                    strokeDasharray="5 3" 
                    connectNulls={false}
                  />
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
