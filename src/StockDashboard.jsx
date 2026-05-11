import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Hooks & Utils
import useStocks from "./hooks/useStocks";
import usePaperTrade from "./hooks/usePaperTrade";
import { formatINR, formatPercent, formatDateLabel } from "./utils/formatters";

// Components (UPDATED IMPORTS)
import { RiskMeter, ConfidenceRing, CustomTooltip } from "./components/CommonWidgets";
import StockCard from "./components/StockCard";

export default function StockDashboard() {
  const [activePage, setActivePage] = useState("stock");
  
  // Local Form UI States
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [addStockIsin, setAddStockIsin] = useState("");
  const [addStockName, setAddStockName] = useState("");

  // Connect Hooks
  const {
    stocks, selected, setSelected, stockData, loading, remoteStocks,
    stockBusy, stockError, stockNotice, addWatchlistStock, removeWatchlistStock
  } = useStocks();

  const {
    paperPortfolio, paperLoading, paperBusy, paperError, paperNotice,
    placePaperOrder, addPaperFunds, resetPaperAccount
  } = usePaperTrade();

  // Derived Values
  const data = stockData[selected];
  const meta = (remoteStocks || stocks).find(s => s.ticker === selected) || {};
  const todayPrice = meta.last_price ?? data?.lastPrice ?? null;
  const predictedVal = data?.predicted?.[0]?.price ?? null;

  useEffect(() => {
    const livePrice = Number(todayPrice ?? data?.lastPrice);
    if (Number.isFinite(livePrice) && livePrice > 0) {
      setTradePrice(livePrice.toFixed(2));
    }
  }, [selected, todayPrice, data?.lastPrice]);

  const handlePlaceOrder = async (side) => {
    const amount = Number(tradeAmount);
    const fallbackPrice = Number(todayPrice ?? data?.lastPrice);
    const editedPrice = Number(tradePrice);
    const executionPrice = Number.isFinite(editedPrice) && editedPrice > 0 ? editedPrice : Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : NaN;
    
    const success = await placePaperOrder(side, selected, amount, executionPrice);
    if (success) setTradeAmount("");
  };

  const handleAddStock = async () => {
    const success = await addWatchlistStock(addStockIsin, addStockName);
    if (success) {
      setAddStockIsin("");
      setAddStockName("");
    }
  };

  const handleAddFunds = async () => {
    const success = await addPaperFunds(fundAmount);
    if (success) setFundAmount("");
  };

  const paper = paperPortfolio || {
    cash_balance: 0, total_funded: 0, invested_cost: 0, market_value: 0, equity: 0,
    realized_pnl: 0, unrealized_pnl: 0, total_pnl: 0, pnl_vs_funded: 0, day_pnl: 0,
    positions: [], trades: [], cash_flows: [],
  };
  
  const selectedPosition = (paper.positions || []).find((p) => p.isin === selected);
  const watchlistSource = remoteStocks || stocks;
  const query = (stockSearch || "").trim().toLowerCase();
  const visibleStocks = query
    ? watchlistSource.filter((s) => {
        const name = (s.name || "").toLowerCase();
        const ticker = (s.ticker || "").toLowerCase();
        return name.includes(query) || ticker.includes(query);
      })
    : watchlistSource;
  
  const chartActualHistory = data?.history ? data.history.slice(-10) : [];
  const chartBacktest = data?.backtest ? data.backtest.slice(-10) : [];
  const chartFuture = data?.predicted ? data.predicted.slice(0, 5) : [];
  const forecastRows = data?.predicted ? data.predicted.slice(0, 5) : [];
  const avgBacktestAbsError = (data?.backtest?.length || 0) > 0
    ? data.backtest.reduce((sum, row) => sum + Math.abs((row.actual ?? 0) - (row.predicted ?? 0)), 0) / data.backtest.length
    : NaN;

  const chartMap = new Map();
  chartActualHistory.forEach((row) => {
    chartMap.set(row.ts, { ts: row.ts, dateLabel: row.dateLabel, actual: row.price, predicted: null, lower: null, upper: null });
  });
  chartBacktest.forEach((row) => {
    const existing = chartMap.get(row.ts) || { ts: row.ts, dateLabel: row.dateLabel, actual: null, predicted: null, lower: null, upper: null };
    existing.predicted = row.predicted;
    if (existing.actual === null && Number.isFinite(row.actual)) {
      existing.actual = row.actual;
    }
    chartMap.set(row.ts, existing);
  });
  chartFuture.forEach((row) => {
    const existing = chartMap.get(row.ts) || { ts: row.ts, dateLabel: row.dateLabel, actual: null, predicted: null, lower: null, upper: null };
    existing.predicted = row.price;
    existing.lower = Number.isFinite(row.lower) ? row.lower : null;
    existing.upper = Number.isFinite(row.upper) ? row.upper : null;
    chartMap.set(row.ts, existing);
  });
  const chartData = Array.from(chartMap.values()).sort((a, b) => a.ts - b.ts);
  const latestActualTs = chartActualHistory[chartActualHistory.length - 1]?.ts;

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
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setActivePage("stock")}
              style={{
                background: activePage === "stock" ? "#00e5a022" : "#0a1520",
                color: activePage === "stock" ? "#00e5a0" : "#778899",
                border: `1px solid ${activePage === "stock" ? "#00e5a055" : "#1a2a3a"}`,
                borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >
              STOCK PAGE
            </button>
            <button
              onClick={() => setActivePage("admin")}
              style={{
                background: activePage === "admin" ? "#00e5a022" : "#0a1520",
                color: activePage === "admin" ? "#00e5a0" : "#778899",
                border: `1px solid ${activePage === "admin" ? "#00e5a055" : "#1a2a3a"}`,
                borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >
              ADMIN PAGE
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#8899aa" }}>Wallet: <span style={{ color: "#00e5a0", fontWeight: 700 }}>{formatINR(paper.cash_balance)}</span></div>
          <div style={{ fontSize: 11, color: "#445566" }}>DATA SOURCE</div>
          <div style={{ background: "#1a2a3a", border: "1px solid #2a3a4a", color: "#778899", borderRadius: 20, padding: "4px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>
            LIVE API
          </div>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "pulse 2s infinite" }} />
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ borderRight: "1px solid #1a2a3a", padding: 16, overflowY: "auto", background: "#07101a" }}>
        <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 12, paddingLeft: 4 }}>WATCHLIST</div>
        <div style={{ marginBottom: 10 }}>
          <input
            type="text" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
            placeholder="Search by name or ISIN"
            style={{ width: "100%", background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "9px 10px", fontSize: 12, outline: "none" }}
          />
        </div>
        <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#556677", marginBottom: 8, letterSpacing: 1 }}>ADD STOCK</div>
          <input
            type="text" value={addStockIsin} onChange={(e) => setAddStockIsin(e.target.value.toUpperCase())}
            placeholder="ISIN (e.g. INE467B01029)"
            style={{ width: "100%", background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "8px 10px", fontSize: 11, outline: "none", marginBottom: 8 }}
          />
          <input
            type="text" value={addStockName} onChange={(e) => setAddStockName(e.target.value)}
            placeholder="Stock name"
            style={{ width: "100%", background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "8px 10px", fontSize: 11, outline: "none", marginBottom: 8 }}
          />
          <button
            onClick={handleAddStock} disabled={stockBusy}
            style={{ width: "100%", background: "#00e5a022", color: "#00e5a0", border: "1px solid #00e5a055", borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 700, cursor: stockBusy ? "not-allowed" : "pointer", opacity: stockBusy ? 0.6 : 1 }}
          >
            {stockBusy ? "ADDING..." : "ADD TO WATCHLIST"}
          </button>
          {(stockError || stockNotice) && (
            <div style={{ marginTop: 8, fontSize: 10, color: stockError ? "#fca5a5" : "#7cfccf" }}>
              {stockError || stockNotice}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleStocks.map(s => (
            <StockCard key={s.ticker} ticker={s.ticker} name={s.name} meta={s} selected={selected === s.ticker}
              data={stockData[s.ticker]} onClick={() => { setSelected(s.ticker); setActivePage("stock"); }} onRemove={() => removeWatchlistStock(s.ticker)} />
          ))}
          {!visibleStocks.length && <div style={{ color: "#556677", fontSize: 11, padding: "6px 4px" }}>No stocks found.</div>}
        </div>
      </div>

      {/* Main content */}
      <div style={{ overflowY: "auto", padding: "24px 28px" }}>
        {activePage === "admin" ? (
          paperLoading && !paperPortfolio ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", color: "#445566", fontSize: 14 }}>
              Loading paper trading account…
            </div>
          ) : (
            <>
              {(paperError || paperNotice) && (
                <div style={{ marginBottom: 16, borderRadius: 10, padding: "10px 12px", border: `1px solid ${paperError ? "#f8717155" : "#00e5a055"}`, background: paperError ? "#2a1218" : "#0f2a24", color: paperError ? "#fca5a5" : "#7cfccf", fontSize: 12 }}>
                  {paperError || paperNotice}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Cash Balance", value: formatINR(paper.cash_balance), color: "#00e5a0" },
                  { label: "Total Invested", value: formatINR(paper.invested_cost), color: "#9fe7ff" },
                  { label: "Market Value", value: formatINR(paper.market_value), color: "#4a9eff" },
                  { label: "Total P/L", value: formatINR(paper.total_pnl), color: (paper.total_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" },
                ].map((item) => (
                  <div key={item.label} style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#445566", letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1, marginBottom: 12 }}>ADMIN FUNDING</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="number" min="0" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="Amount in INR"
                    style={{ background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "10px 12px", width: 220, outline: "none" }}
                  />
                  <button
                    onClick={handleAddFunds} disabled={paperBusy}
                    style={{ background: "#00e5a022", color: "#00e5a0", border: "1px solid #00e5a055", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: paperBusy ? "not-allowed" : "pointer", opacity: paperBusy ? 0.6 : 1 }}
                  >
                    Add Funds
                  </button>
                  <button
                    onClick={resetPaperAccount} disabled={paperBusy}
                    style={{ background: "#2a1218", color: "#f87171", border: "1px solid #f8717155", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: paperBusy ? "not-allowed" : "pointer", opacity: paperBusy ? 0.6 : 1 }}
                  >
                    Reset Account
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#556677" }}>
                  Total funded: {formatINR(paper.total_funded)} · P/L vs funded: <span style={{ color: (paper.pnl_vs_funded ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(paper.pnl_vs_funded)}</span>
                </div>
              </div>

              <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>OPEN POSITIONS</div>
                {(paper.positions || []).length ? (
                  <div style={{ border: "1px solid #1a2a3a", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1fr", background: "#081321", color: "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                      <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Stock</div>
                      <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Qty</div>
                      <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Avg / Current</div>
                      <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Unrealized</div>
                      <div style={{ padding: "10px 12px" }}>Day P/L</div>
                    </div>
                    {(paper.positions || []).map((pos) => (
                      <div key={pos.isin} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1fr", borderTop: "1px solid #1a2a3a", fontSize: 12 }}>
                        <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a", color: "#cde" }}>{pos.name}</div>
                        <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a", color: "#9bb0c4" }}>{pos.quantity}</div>
                        <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a", color: "#9bb0c4" }}>{formatINR(pos.avg_price)} / {formatINR(pos.current_price)}</div>
                        <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a", color: (pos.unrealized_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(pos.unrealized_pnl)}</div>
                        <div style={{ padding: "10px 12px", color: (pos.day_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(pos.day_pnl)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#556677" }}>No open positions yet.</div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>RECENT TRADES</div>
                  {(paper.trades || []).length ? (
                    (paper.trades || []).slice(0, 8).map((trade) => (
                      <div key={trade.id} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1a2a3a", padding: "9px 0", fontSize: 12 }}>
                        <span style={{ color: "#9bb0c4" }}>{trade.isin}</span>
                        <span style={{ color: trade.side === "buy" ? "#4ade80" : "#f87171", fontWeight: 700 }}>{trade.side.toUpperCase()}</span>
                        <span style={{ color: "#cde" }}>{formatINR(trade.gross_value)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "#556677" }}>No trades yet.</div>
                  )}
                </div>

                <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1, marginBottom: 10 }}>WALLET LEDGER</div>
                  {(paper.cash_flows || []).length ? (
                    (paper.cash_flows || []).slice(0, 8).map((flow) => (
                      <div key={flow.id} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1a2a3a", padding: "9px 0", fontSize: 12 }}>
                        <span style={{ color: "#9bb0c4" }}>{flow.kind}</span>
                        <span style={{ color: (flow.amount ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(flow.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "#556677" }}>No ledger entries yet.</div>
                  )}
                </div>
              </div>
            </>
          )
        ) : loading && !data ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", color: "#445566", fontSize: 14 }}>
            Loading predictions…
          </div>
        ) : data ? (
          <>
            {(paperError || paperNotice) && (
              <div style={{ marginBottom: 16, borderRadius: 10, padding: "10px 12px", border: `1px solid ${paperError ? "#f8717155" : "#00e5a055"}`, background: paperError ? "#2a1218" : "#0f2a24", color: paperError ? "#fca5a5" : "#7cfccf", fontSize: 12 }}>
                {paperError || paperNotice}
              </div>
            )}

            {/* Stock header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  {(() => {
                    const metaObj = (remoteStocks || stocks).find(s => s.ticker === selected) || {};
                    const displayName = metaObj.name || data?.name || selected;
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
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, color: "#e8f4ff", fontWeight: 700 }}>{formatINR(todayPrice ?? data?.lastPrice)}</div>
                    <div style={{ fontSize: 12, color: "#8899aa", marginTop: 4 }}>
                      Today: {formatINR(todayPrice)} · Predicted: {formatINR(predictedVal)}
                    </div>
                  </div>
                  <span style={{ color: data?.changePct >= 0 ? "#4ade80" : "#f87171", fontSize: 14, fontWeight: 600 }}>
                    {data?.changePct >= 0 ? "▲" : "▼"} {Math.abs(data?.change ?? 0)} ({Math.abs(data?.changePct ?? 0)}%)
                  </span>
                  <span style={{ fontSize: 11, color: "#445566" }}>15D</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <ConfidenceRing value={data.confidence} />
              </div>
            </div>

            {/* Paper Trade */}
            <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1 }}>PAPER TRADE · AMOUNT BASED</div>
                <div style={{ fontSize: 12, color: "#00e5a0", fontWeight: 700 }}>Cash: {formatINR(paper.cash_balance)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input
                  type="number" min="0" step="0.01" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)}
                  placeholder="Trade amount in INR"
                  style={{ background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "10px 12px", width: 220, outline: "none" }}
                />
                <input
                  type="number" min="0" step="0.01" value={tradePrice} onChange={(e) => setTradePrice(e.target.value)}
                  placeholder="Execution price"
                  style={{ background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "10px 12px", width: 170, outline: "none" }}
                />
                <button
                  onClick={() => {
                    const live = Number(todayPrice ?? data?.lastPrice);
                    if (Number.isFinite(live) && live > 0) setTradePrice(live.toFixed(2));
                  }}
                  style={{ background: "#081321", color: "#9bb0c4", border: "1px solid #1a2a3a", borderRadius: 8, padding: "9px 12px", fontSize: 11, cursor: "pointer" }}
                >
                  Use Today
                </button>
                <button
                  onClick={() => handlePlaceOrder("buy")} disabled={paperBusy}
                  style={{ background: "#0f2a24", color: "#4ade80", border: "1px solid #4ade8055", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: paperBusy ? "not-allowed" : "pointer", opacity: paperBusy ? 0.6 : 1 }}
                >
                  BUY
                </button>
                <button
                  onClick={() => handlePlaceOrder("sell")} disabled={paperBusy}
                  style={{ background: "#2a1218", color: "#f87171", border: "1px solid #f8717155", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: paperBusy ? "not-allowed" : "pointer", opacity: paperBusy ? 0.6 : 1 }}
                >
                  SELL
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#667788", marginBottom: 8 }}>
                Default execution price is today price: <span style={{ color: "#9fe7ff" }}>{formatINR(todayPrice ?? data?.lastPrice)}</span>. You can edit this price before Buy/Sell.
              </div>
              <div style={{ fontSize: 11, color: "#667788" }}>
                Current holding: {selectedPosition ? `${selectedPosition.quantity} qty` : "0 qty"} · Position value: {formatINR(selectedPosition?.market_value ?? 0)} · Unrealized P/L: <span style={{ color: (selectedPosition?.unrealized_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(selectedPosition?.unrealized_pnl ?? 0)}</span> · Day P/L: <span style={{ color: (selectedPosition?.day_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(selectedPosition?.day_pnl ?? 0)}</span>
              </div>
            </div>

            {/* Chart */}
            <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: "20px 16px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingRight: 8 }}>
                <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>LAST 10 DAYS + NEXT 5 DAYS · ACTUAL & PREDICTED</span>
                <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                  <span style={{ color: "#4a9eff" }}>── Actual</span>
                  <span style={{ color: "#00e5a0" }}>── Predicted</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1a2a3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis type="number" dataKey="ts" scale="time" domain={["dataMin", "dataMax"]} tick={{ fill: "#445566", fontSize: 10 }} tickFormatter={(v) => formatDateLabel(Number(v))} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v)} width={68} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={latestActualTs} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />
                  <Line type="linear" dataKey="actual" stroke="#4a9eff" strokeWidth={2} dot={chartData.length <= 120} connectNulls={false} />
                  <Line type="linear" dataKey="predicted" stroke="#00e5a0" strokeWidth={2} dot={chartData.length <= 120} connectNulls={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Prediction Details */}
            <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 14 }}>PREDICTION DETAILS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Next Day Range", value: `${formatINR(data.p10)} - ${formatINR(data.p90)}`, note: "p10 to p90" },
                  { label: "Model MAE", value: formatINR(data.mae), note: "Average absolute error" },
                  { label: "Model MAPE", value: formatPercent(data.mape), note: "Average percentage error" },
                  { label: "Backtest Error", value: formatINR(avgBacktestAbsError), note: "Avg |actual - predicted|" },
                ].map((metric) => (
                  <div key={metric.label} style={{ background: "#060e17", border: "1px solid #1a2a3a", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#445566", letterSpacing: 1, marginBottom: 6 }}>{metric.label}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#e8f4ff", marginBottom: 4 }}>{metric.value}</div>
                    <div style={{ fontSize: 10, color: "#667788" }}>{metric.note}</div>
                  </div>
                ))}
              </div>

              <div style={{ border: "1px solid #1a2a3a", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, background: "#081321", color: "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Date</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Predicted</div>
                  <div style={{ padding: "10px 12px" }}>Range</div>
                </div>
                {forecastRows.length ? (
                  forecastRows.map((row) => (
                    <div key={row.ts} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, borderTop: "1px solid #1a2a3a", fontSize: 12 }}>
                      <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a", color: "#9bb0c4" }}>{row.dateLabel}</div>
                      <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a", color: "#00e5a0", fontWeight: 600 }}>{formatINR(row.price)}</div>
                      <div style={{ padding: "10px 12px", color: "#7cc8ad" }}>
                        {Number.isFinite(row.lower) && Number.isFinite(row.upper) ? `${formatINR(row.lower)} - ${formatINR(row.upper)}` : "—"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "12px", color: "#556677", fontSize: 12 }}>No forecast data available.</div>
                )}
              </div>
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
                  { label: "EMA 20", value: formatINR(data.indicators.ema20), note: data.lastPrice > data.indicators.ema20 ? "Above" : "Below", color: data.lastPrice > data.indicators.ema20 ? "#4ade80" : "#f87171" },
                  { label: "EMA 50", value: formatINR(data.indicators.ema50), note: data.lastPrice > data.indicators.ema50 ? "Above" : "Below", color: data.lastPrice > data.indicators.ema50 ? "#4ade80" : "#f87171" },
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