import React, { useState, useEffect, useMemo } from "react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer 
} from "recharts";

// Hooks
import { useStocks } from "./hooks/useStocks";
import { usePaperTrade } from "./hooks/usePaperTrade";

// Utilities & Components
import { formatINR } from "./utils/formatters";
import RiskMeter from "./components/RiskMeter";
import ConfidenceRing from "./components/ConfidenceRing";
import CustomTooltip from "./components/CustomTooltip";
import StockCard from "./components/StockCard";

export default function StockDashboard() {
  // 1. Hook Integration
  const { stocks, selected, setSelected, stockData, loading } = useStocks();
  const { 
    paper, paperBusy, paperNotice, placePaperOrder 
  } = usePaperTrade();

  // 2. Local UI State
  const [activePage, setActivePage] = useState("stock");
  const [stockSearch, setStockSearch] = useState("");
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradePrice, setTradePrice] = useState("");

  // 3. Derived Data (Legacy Logic Preserved)
  const data = stockData[selected];
  const meta = stocks.find(s => s.ticker === selected) || {};
  const todayPrice = meta.last_price ?? data?.lastPrice ?? null;

  // 4. Legacy Chart Construction Logic (Restored)
  const chartData = useMemo(() => {
    const chartMap = new Map();
    if (data?.history) {
      data.history.slice(-10).forEach((row) => {
        chartMap.set(row.ts, { ts: row.ts, dateLabel: row.dateLabel, actual: row.price, predicted: null });
      });
    }
    if (data?.backtest) {
      data.backtest.slice(-10).forEach((row) => {
        const ex = chartMap.get(row.ts) || { ts: row.ts, dateLabel: row.dateLabel, actual: null };
        chartMap.set(row.ts, { ...ex, predicted: row.predicted });
      });
    }
    if (data?.predicted) {
      data.predicted.slice(0, 5).forEach((row) => {
        const ex = chartMap.get(row.ts) || { ts: row.ts, dateLabel: row.dateLabel, actual: null };
        chartMap.set(row.ts, { ...ex, predicted: row.price, lower: row.lower, upper: row.upper });
      });
    }
    return Array.from(chartMap.values()).sort((a, b) => a.ts - b.ts);
  }, [data]);

  // 5. Effects
  useEffect(() => {
    if (todayPrice) setTradePrice(Number(todayPrice).toFixed(2));
  }, [selected, todayPrice]);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={{ fontWeight: 700, color: "#fff", fontFamily: 'Space Mono' }}>Algooee</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ fontSize: 11 }}>Wallet: <span style={{ color: "#00e5a0" }}>{formatINR(paper.cash_balance)}</span></div>
          <button onClick={() => setActivePage("stock")} style={navBtnStyle(activePage === "stock")}>STOCK</button>
          <button onClick={() => setActivePage("admin")} style={navBtnStyle(activePage === "admin")}>ADMIN</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={sidebarStyle}>
        <input 
          placeholder="Search stocks..." 
          value={stockSearch}
          onChange={(e) => setStockSearch(e.target.value)}
          style={searchInputStyle} 
        />
        {stocks
          .filter(s => s.ticker.toLowerCase().includes(stockSearch.toLowerCase()))
          .map(s => (
            <StockCard 
              key={s.ticker} 
              ticker={s.ticker} 
              name={s.name} 
              selected={selected === s.ticker} 
              data={stockData[s.ticker]} 
              meta={s}
              onClick={() => setSelected(s.ticker)} 
            />
          ))
        }
      </aside>

      {/* Main Content */}
      <main style={{ padding: 30, overflowY: "auto" }}>
        {loading ? (
          <div style={{ color: "#00e5a0" }}>Loading Intelligence...</div>
        ) : activePage === "stock" ? (
          <div style={{ display: 'grid', gap: 24 }}>
            {/* Analysis Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
              <div style={mainCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0 }}>{selected} <span style={{ color: '#567', fontSize: 14 }}>{meta.name}</span></h2>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{formatINR(todayPrice)}</div>
                </div>
                <div style={{ height: 300, marginTop: 20 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" vertical={false} />
                      <XAxis dataKey="dateLabel" stroke="#445566" fontSize={10} />
                      <YAxis domain={['auto', 'auto']} stroke="#445566" fontSize={10} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="actual" stroke="#4a9eff" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="predicted" stroke="#00e5a0" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={sideCardStyle}>
                  <RiskMeter score={data?.riskScore || 0} />
                </div>
                <div style={{ ...sideCardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
                  <ConfidenceRing value={data?.confidence || 0} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#567' }}>TREND</div>
                    <div style={{ color: data?.trend?.toLowerCase() === 'bullish' ? '#00e5a0' : '#f87171', fontWeight: 700 }}>
                      {(data?.trend || 'NEUTRAL').toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Paper Trading Section */}
            <div style={mainCardStyle}>
              <h3>Paper Trade {selected}</h3>
              <div style={{ display: 'flex', gap: 12 }}>
                <input 
                  type="number" 
                  placeholder="Qty" 
                  value={tradeAmount} 
                  onChange={e => setTradeAmount(e.target.value)} 
                  style={tradeInputStyle} 
                />
                <button 
                  onClick={() => placePaperOrder(selected, 'buy', tradeAmount, tradePrice)} 
                  disabled={paperBusy}
                  style={buyBtnStyle}
                >BUY</button>
                <button 
                  onClick={() => placePaperOrder(selected, 'sell', tradeAmount, tradePrice)} 
                  disabled={paperBusy}
                  style={sellBtnStyle}
                >SELL</button>
              </div>
              {paperNotice && <div style={{ color: '#00e5a0', fontSize: 12, marginTop: 8 }}>{paperNotice}</div>}
            </div>
          </div>
        ) : (
          <div style={mainCardStyle}>
            <h2>Admin Panel</h2>
            <p>Wallet Balance: {formatINR(paper.cash_balance)}</p>
            {/* You can map paper.positions here */}
          </div>
        )}
      </main>
    </div>
  );
}

// --- Styles (Restored exactly from your layout) ---
const containerStyle = {
  minHeight: "100vh", background: "#060e17", color: "#cde", 
  fontFamily: "'DM Sans', sans-serif", display: "grid", 
  gridTemplateColumns: "280px 1fr", gridTemplateRows: "60px 1fr"
};
const headerStyle = {
  gridColumn: "1/-1", display: "flex", alignItems: "center", 
  justifyContent: "space-between", padding: "0 28px", 
  background: "#07101a", borderBottom: "1px solid #1a2a3a"
};
const sidebarStyle = { padding: 20, borderRight: "1px solid #1a2a3a", overflowY: "auto" };
const searchInputStyle = { width: "100%", padding: 8, background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 6, color: "#fff", marginBottom: 20 };
const navBtnStyle = (active) => ({
  background: active ? "#00e5a022" : "transparent",
  color: active ? "#00e5a0" : "#778",
  border: active ? "1px solid #00e5a055" : "1px solid #1a2a3a",
  padding: "4px 12px", borderRadius: 8, cursor: "pointer"
});
const mainCardStyle = { background: "#0a1520", padding: 24, borderRadius: 12, border: "1px solid #1a2a3a" };
const sideCardStyle = { background: "#0a1520", padding: 20, borderRadius: 12, border: "1px solid #1a2a3a" };
const tradeInputStyle = { background: '#060e17', border: '1px solid #1a2a3a', color: '#fff', padding: 8, borderRadius: 6 };
const buyBtnStyle = { background: '#00e5a0', color: '#060e17', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' };
const sellBtnStyle = { background: '#f87171', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' };