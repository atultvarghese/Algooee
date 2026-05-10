import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useStocks } from "./hooks/useStocks";
import { formatINR } from "./utils/formatters";
import { RiskMeter } from "./components/RiskMeter";
import { StockCard } from "./components/StockCard"; // Move your StockCard function here

export default function StockDashboard() {
  const { stocks, selected, setSelected, stockData, loading } = useStocks();
  const [activePage, setActivePage] = useState("stock");
  
  const data = stockData[selected];

  return (
    <div style={{
      minHeight: "100vh", background: "#060e17", color: "#cde", fontFamily: "'DM Sans', sans-serif",
      display: "grid", gridTemplateColumns: "280px 1fr", gridTemplateRows: "60px 1fr"
    }}>
      {/* Header */}
      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", borderBottom: "1px solid #1a2a3a", background: "#07101a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff" }}>Algooee</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
             <button onClick={() => setActivePage("stock")} style={{ background: activePage === "stock" ? "#00e5a022" : "transparent", color: "#00e5a0", border: "1px solid #00e5a055", padding: "6px 12px", borderRadius: 8, cursor: 'pointer' }}>STOCK PAGE</button>
             <button onClick={() => setActivePage("admin")} style={{ background: "transparent", color: "#778899", border: "1px solid #1a2a3a", padding: "6px 12px", borderRadius: 8, cursor: 'pointer' }}>ADMIN PAGE</button>
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ borderRight: "1px solid #1a2a3a", padding: "20px", overflowY: "auto" }}>
        <input type="text" placeholder="Search..." style={{ width: "100%", background: "#0a1520", border: "1px solid #1a2a3a", color: "#fff", padding: "8px", borderRadius: "6px", marginBottom: "20px" }} />
        {stocks.map(s => (
          <StockCard 
            key={s.ticker} 
            ticker={s.ticker} 
            name={s.name}
            selected={selected === s.ticker}
            onClick={() => setSelected(s.ticker)}
            data={stockData[s.ticker]}
          />
        ))}
      </div>

      {/* Main Content */}
      <div style={{ padding: "30px", overflowY: "auto" }}>
        {loading ? <div style={{ color: "#00e5a0" }}>ANALYZING MARKET DATA...</div> : (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ background: "#0a1520", padding: "20px", borderRadius: "12px", border: "1px solid #1a2a3a" }}>
               <h2 style={{ margin: 0 }}>{selected} Analysis</h2>
               {data && <RiskMeter score={data.riskScore || 0} />}
            </div>
            {/* Chart Container would go here */}
          </div>
        )}
      </div>
    </div>
  );
}