import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Hooks & Utils
import useStocks from "./hooks/useStocks";
import usePaperTrade from "./hooks/usePaperTrade";
import { formatINR, formatPercent, formatDateLabel, formatExactDateTime, formatPreciseRelativeTime } from "./utils/formatters";
import { API_BASE } from "./utils/constants";

const roundQty = (q) => {
  const n = Number(q);
  return Number.isFinite(n) ? +n.toFixed(4) : "0";
};

const getDaysRemaining = (expiryDateStr) => {
  if (!expiryDateStr) return "";
  const expiry = new Date(expiryDateStr);
  const today = new Date();
  
  expiry.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "1 day remaining";
  return `${diffDays} days remaining`;
};

// Components (UPDATED IMPORTS)
import { RiskMeter, ConfidenceRing, CustomTooltip } from "./components/CommonWidgets";
import StockCard from "./components/StockCard";
import OptionsChainView from "./components/OptionsChainView";

export default function StockDashboard() {
  const [activePage, setActivePage] = useState("stock");
  const [optionUnderlying, setOptionUnderlying] = useState("NIFTY");
  const [selectedOptionContract, setSelectedOptionContract] = useState(null);

  // Local Form UI States
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [stockSearch, setStockSearch] = useState("");

  // Upstox Live Search UI States
  const [liveQuery, setLiveQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

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
  const todayPrice = data?.lastPrice ?? meta.last_price ?? null;
  const predictedVal = data?.predicted?.[0]?.price ?? null;

  useEffect(() => {
    const livePrice = Number(todayPrice ?? data?.lastPrice);
    if (Number.isFinite(livePrice) && livePrice > 0) {
      setTradePrice(livePrice.toFixed(2));
    }
  }, [selected, todayPrice, data?.lastPrice]);

  const handlePlaceOrder = async (side) => {
    const qty = Number(tradeAmount);
    const fallbackPrice = Number(todayPrice ?? data?.lastPrice);
    const editedPrice = Number(tradePrice);
    const executionPrice = Number.isFinite(editedPrice) && editedPrice > 0 ? editedPrice : Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : NaN;
    const amount = qty * executionPrice;

    const success = await placePaperOrder(side, selected, amount, executionPrice);
    if (success) setTradeAmount("");
  };

  const handleSelectSuggestion = async (suggestion) => {
    setLiveQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    await addWatchlistStock(suggestion.isin, suggestion.name);
  };

  useEffect(() => {
    if (!liveQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`${API_BASE}/api/instruments/search?q=${encodeURIComponent(liveQuery)}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to search instruments");
          return res.json();
        })
        .then((data) => {
          setSearchResults(data.results || []);
          setShowDropdown(true);
        })
        .catch((err) => {
          console.error("Live search error:", err);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [liveQuery]);

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
  const chartFuture = data?.predicted ? data.predicted.slice(0, 1) : [];
  const forecastRows = data?.predicted ? data.predicted.slice(0, 1) : [];
  const summary = data?.backtestSummary || {};
  const avgBacktestAbsError = Number.isFinite(summary.mae) ? summary.mae : (data?.backtest?.length || 0) > 0
    ? data.backtest.reduce((sum, row) => sum + Math.abs((row.actual ?? 0) - (row.predicted ?? 0)), 0) / data.backtest.length
    : NaN;
  const backtestRows = data?.backtest ? data.backtest.slice(-8).reverse() : [];
  const modelEdgePct = Number(summary.modelEdgePct);
  const directionalAccuracy = Number(summary.directionalAccuracy);
  const intervalCoverage = Number(summary.intervalCoverage);

  const chartMap = new Map();
  chartActualHistory.forEach((row) => {
    chartMap.set(row.ts, { ts: row.ts, dateLabel: row.dateLabel, actual: row.price, predicted: null, lower: null, upper: null });
  });
  chartBacktest.forEach((row) => {
    const existing = chartMap.get(row.ts) || { ts: row.ts, dateLabel: row.dateLabel, actual: null, predicted: null, lower: null, upper: null };
    existing.predicted = row.predicted;
    existing.lower = Number.isFinite(row.lower) ? row.lower : existing.lower;
    existing.upper = Number.isFinite(row.upper) ? row.upper : existing.upper;
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
              onClick={() => setActivePage("options")}
              style={{
                background: activePage === "options" ? "#00e5a022" : "#0a1520",
                color: activePage === "options" ? "#00e5a0" : "#778899",
                border: `1px solid ${activePage === "options" ? "#00e5a055" : "#1a2a3a"}`,
                borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >
              OPTIONS CHAIN
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
        <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 10, padding: 10, marginBottom: 12, position: "relative" }}>
          <div style={{ fontSize: 10, color: "#556677", marginBottom: 8, letterSpacing: 1 }}>ADD STOCK</div>
          <div style={{ position: "relative" }}>
            <input
              type="text" value={liveQuery} onChange={(e) => setLiveQuery(e.target.value)}
              placeholder="Search Live Upstox Equities..."
              style={{ width: "100%", background: "#060e17", border: "1px solid #1a2a3a", color: "#cde", borderRadius: 8, padding: "8px 10px", fontSize: 11, outline: "none" }}
            />
            {searchLoading && (
              <span style={{ position: "absolute", right: 10, top: 8, fontSize: 10, color: "#556677" }}>
                Searching...
              </span>
            )}
          </div>
          
          {showDropdown && searchResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0,
              background: "#08101a", border: "1px solid #142234",
              borderRadius: 8, marginTop: 4, zIndex: 50,
              maxHeight: 180, overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
            }}>
              {searchResults.map((suggestion) => (
                <div
                  key={suggestion.isin}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  style={{
                    padding: "8px 12px", cursor: "pointer",
                    borderBottom: "1px solid #142234", fontSize: 11,
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#142234"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{suggestion.trading_symbol}</div>
                    <div style={{ color: "#556677", fontSize: 9 }}>{suggestion.name}</div>
                  </div>
                  <span style={{ color: "#00e5a0", fontSize: 9 }}>+ Add</span>
                </div>
              ))}
            </div>
          )}

          {showDropdown && searchResults.length === 0 && liveQuery.trim() !== "" && !searchLoading && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0,
              background: "#08101a", border: "1px solid #142234",
              borderRadius: 8, marginTop: 4, zIndex: 50,
              padding: "10px", fontSize: 10, color: "#556677", textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
            }}>
              No equities found
            </div>
          )}

          {(stockError || stockNotice) && (
            <div style={{ marginTop: 8, fontSize: 10, color: stockError ? "#fca5a5" : "#7cfccf" }}>
              {stockError || stockNotice}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleStocks.map(s => (
            <StockCard key={s.ticker} ticker={s.ticker} name={s.name} meta={s} selected={selected === s.ticker}
              data={stockData[s.ticker]} onClick={() => {
                setSelected(s.ticker);
                if (activePage === "options") {
                  setOptionUnderlying(s.ticker);
                } else {
                  setActivePage("stock");
                }
              }} onRemove={() => removeWatchlistStock(s.ticker)} />
          ))}
          {!visibleStocks.length && <div style={{ color: "#556677", fontSize: 11, padding: "6px 4px" }}>No stocks found.</div>}
        </div>
      </div>

      {/* Main content */}
      <div style={{ overflowY: "auto", padding: "24px 28px" }}>
        {activePage === "options" ? (
          <OptionsChainView
            stocks={stocks}
            selectedUnderlying={optionUnderlying}
            setSelectedUnderlying={setOptionUnderlying}
            paper={paper}
            paperBusy={paperBusy}
            placePaperOrder={placePaperOrder}
            formatINR={formatINR}
            selectedOptionContract={selectedOptionContract}
            setSelectedOptionContract={setSelectedOptionContract}
          />
        ) : activePage === "admin" ? (
          paperLoading && !paperPortfolio ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", color: "#445566", fontSize: 14 }}>
              Loading paper trading account…
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
              {/* Alert / Notice */}
              {(paperError || paperNotice) && (
                <div style={{
                  borderRadius: 10, padding: "12px 16px",
                  border: `1px solid ${paperError ? "#f8717133" : "#00e5a033"}`,
                  background: paperError ? "#1e0b0e" : "#051612",
                  color: paperError ? "#fca5a5" : "#7cfccf",
                  fontSize: 12, display: "flex", alignItems: "center", gap: 10
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: paperError ? "#ef4444" : "#10b981" }} />
                  {paperError || paperNotice}
                </div>
              )}

              {/* Main Grid: Left for portfolio holdings, Right for actions & logs */}
              <div style={{ display: "grid", gridTemplateColumns: "2.1fr 1fr", gap: "24px", alignItems: "start" }}>

                {/* Left Side: Metrics & Positions */}
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                  {/* Metric Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {[
                      { label: "Cash Balance", value: formatINR(paper.cash_balance), color: "#00e5a0", desc: "Available for trading" },
                      { label: "Total Invested", value: formatINR(paper.invested_cost), color: "#9fe7ff", desc: "Capital in holdings" },
                      { label: "Market Value", value: formatINR(paper.market_value), color: "#4a9eff", desc: "Current holdings value" },
                      { label: "Total Profit / Loss", value: formatINR(paper.total_pnl), color: (paper.total_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444", desc: "Unrealized P/L of open positions" },
                    ].map((item) => (
                      <div key={item.label} style={{
                        background: "#08101a", border: "1px solid #142234",
                        borderRadius: 12, padding: "16px",
                        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
                      }}>
                        <div style={{ fontSize: 10, color: "#556a84", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.value}</div>
                        <div style={{ fontSize: 10, color: "#3a4e68" }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* Open Positions Card */}
                  <div style={{
                    background: "#08101a", border: "1px solid #142234",
                    borderRadius: 12, padding: "20px",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>PORTFOLIO HOLDINGS</div>
                      <div style={{ fontSize: 10, color: "#556a84" }}>{(paper.positions || []).length} active assets</div>
                    </div>

                    {(paper.positions || []).length ? (
                      <div style={{ border: "1px solid #142234", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1.3fr 1.1fr 1.0fr 0.9fr 1.0fr 1.2fr 0.9fr",
                          background: "#0c1827", color: "#556a84",
                          fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase"
                        }}>
                          <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>Asset</div>
                          <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>Amt Purchased</div>
                          <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>Avg Cost</div>
                          <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>Current</div>
                          <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>Unrealized P/L</div>
                          <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>Purchase Date & Recency</div>
                          <div style={{ padding: "12px 14px", textAlign: "center" }}>Action</div>
                        </div>
                        {(paper.positions || []).map((pos) => (
                          <div key={pos.id || pos.isin} style={{
                            display: "grid",
                            gridTemplateColumns: "1.3fr 1.1fr 1.0fr 0.9fr 1.0fr 1.2fr 0.9fr",
                            borderTop: "1px solid #142234", fontSize: 12,
                            background: "#08101a", color: "#cde",
                            alignItems: "center"
                          }}>
                            <div style={{ padding: "12px 14px", borderRight: "1px solid #142234" }}>
                              <div style={{ fontWeight: 600, color: "#fff" }}>{pos.name}</div>
                              <div style={{ fontSize: 9, color: "#556a84", marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                                {pos.is_option && pos.expiry ? (
                                  <>
                                    <span style={{ color: "#8899aa" }}>Expiry: <span style={{ color: "#cde" }}>{pos.expiry}</span></span>
                                    <span style={{ color: "#ffb077", fontWeight: 500 }}>({getDaysRemaining(pos.expiry)})</span>
                                  </>
                                ) : (
                                  pos.isin
                                )}
                              </div>
                            </div>
                            <div style={{ padding: "12px 14px", borderRight: "1px solid #142234", fontFamily: "'Space Mono', monospace", color: "#9bb0c4" }}>
                              {formatINR(pos.cost_value)}
                            </div>
                            <div style={{ padding: "12px 14px", borderRight: "1px solid #142234", fontFamily: "'Space Mono', monospace", color: "#9bb0c4" }}>
                              {formatINR(pos.avg_price)}
                            </div>
                            <div style={{ padding: "12px 14px", borderRight: "1px solid #142234", fontFamily: "'Space Mono', monospace", color: "#e8f4ff" }}>
                              {formatINR(pos.current_price)}
                            </div>
                            <div style={{
                              padding: "12px 14px", borderRight: "1px solid #142234",
                              fontFamily: "'Space Mono', monospace",
                              color: (pos.unrealized_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444",
                              fontWeight: 600
                            }}>
                              {formatINR(pos.unrealized_pnl)}
                            </div>
                            <div style={{ padding: "12px 14px", borderRight: "1px solid #142234", color: "#9bb0c4" }}>
                              <div style={{ color: "#fff", fontFamily: "'Space Mono', monospace" }}>{formatExactDateTime(pos.updated_at)}</div>
                              <div style={{ fontSize: 10, color: "#00e5a0", marginTop: 2 }}>{formatPreciseRelativeTime(pos.updated_at)}</div>
                            </div>
                            <div style={{ padding: "8px 6px", display: "flex", gap: "4px", justifyContent: "center" }}>
                              <button
                                onClick={() => {
                                  if (pos.is_option) {
                                    const underlying = pos.name.split(" ")[0];
                                    setOptionUnderlying(underlying);
                                    setSelectedOptionContract({
                                      key: pos.isin,
                                      symbol: pos.name,
                                      underlying: underlying,
                                      expiry: pos.expiry,
                                      side: "buy",
                                      type: pos.name.split(" ")[2],
                                      strike: parseFloat(pos.name.split(" ")[1]),
                                      ltp: pos.current_price
                                    });
                                    setActivePage("options");
                                  } else {
                                    setSelected(pos.isin);
                                    setActivePage("stock");
                                  }
                                }}
                                disabled={paperBusy}
                                style={{
                                  background: "#0f2a24",
                                  color: "#4ade80",
                                  border: "1px solid #4ade8055",
                                  borderRadius: 6,
                                  padding: "6px 8px",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: paperBusy ? "not-allowed" : "pointer",
                                  opacity: paperBusy ? 0.5 : 1,
                                  transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                  if (!paperBusy) {
                                    e.currentTarget.style.background = "#10b981";
                                    e.currentTarget.style.color = "#fff";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!paperBusy) {
                                    e.currentTarget.style.background = "#0f2a24";
                                    e.currentTarget.style.color = "#4ade80";
                                  }
                                }}
                              >
                                BUY
                              </button>
                              <button
                                onClick={() => {
                                  const executionPrice = pos.current_price;
                                  const amount = pos.quantity * executionPrice;
                                  placePaperOrder(
                                    "sell",
                                    pos.isin,
                                    amount,
                                    executionPrice,
                                    pos.is_option ? pos.name : null,
                                    pos.is_option ? pos.expiry : null
                                  );
                                }}
                                disabled={paperBusy}
                                style={{
                                  background: "#2a1218",
                                  color: "#f87171",
                                  border: "1px solid #f8717155",
                                  borderRadius: 6,
                                  padding: "6px 8px",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: paperBusy ? "not-allowed" : "pointer",
                                  opacity: paperBusy ? 0.5 : 1,
                                  transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                  if (!paperBusy) {
                                    e.currentTarget.style.background = "#ef4444";
                                    e.currentTarget.style.color = "#fff";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!paperBusy) {
                                    e.currentTarget.style.background = "#2a1218";
                                    e.currentTarget.style.color = "#f87171";
                                  }
                                }}
                              >
                                SELL
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: "center", padding: "40px 20px",
                        border: "1px dashed #142234", borderRadius: 8,
                        color: "#556a84", fontSize: 12
                      }}>
                        No open holdings in your paper portfolio yet. Go to Stock Page to Buy stocks.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Admin Tools & Transaction Log */}
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                  {/* Admin Funding / Reset Control */}
                  <div style={{
                    background: "#08101a", border: "1px solid #142234",
                    borderRadius: 12, padding: "20px",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
                  }}>
                    <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700, marginBottom: 14 }}>ADMIN CONTROLS</div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600 }}>ADD FUNDS (INR)</label>
                        <input
                          type="number" min="0" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
                          placeholder="Amount in INR (e.g. 50000)"
                          style={{
                            width: "100%", background: "#050b12", border: "1px solid #142234",
                            color: "#cde", borderRadius: 8, padding: "10px 12px",
                            fontSize: 12, outline: "none"
                          }}
                        />
                      </div>

                      <button
                        onClick={handleAddFunds} disabled={paperBusy}
                        style={{
                          width: "100%", background: "#00e5a022", color: "#00e5a0",
                          border: "1px solid #00e5a055", borderRadius: 8,
                          padding: "10px 14px", fontSize: 12, fontWeight: 700,
                          cursor: paperBusy ? "not-allowed" : "pointer", opacity: paperBusy ? 0.6 : 1
                        }}
                      >
                        {paperBusy ? "PROCESSING..." : "DEPOSIT FUNDS"}
                      </button>

                      <div style={{ borderTop: "1px solid #142234", margin: "8px 0" }} />

                      <button
                        onClick={resetPaperAccount} disabled={paperBusy}
                        style={{
                          width: "100%", background: "#ef444415", color: "#fca5a5",
                          border: "1px solid #ef444455", borderRadius: 8,
                          padding: "10px 14px", fontSize: 12, fontWeight: 700,
                          cursor: paperBusy ? "not-allowed" : "pointer", opacity: paperBusy ? 0.6 : 1
                        }}
                      >
                        RESET ACCOUNT (0 CASH)
                      </button>
                    </div>

                    <div style={{ marginTop: 14, fontSize: 10, color: "#556a84", lineHeight: "1.4" }}>
                      Total funded so far: <span style={{ color: "#e8f4ff", fontFamily: "'Space Mono', monospace" }}>{formatINR(paper.total_funded)}</span><br />
                      P/L vs funded: <span style={{ color: (paper.pnl_vs_funded ?? 0) >= 0 ? "#00e5a0" : "#ef4444", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{formatINR(paper.pnl_vs_funded)}</span>
                    </div>
                  </div>

                  {/* Unified Activity Log (Cleaned up trades / ledger) */}
                  <div style={{
                    background: "#08101a", border: "1px solid #142234",
                    borderRadius: 12, padding: "20px",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>RECENT TRANSACTION LOG</div>
                      <span style={{ fontSize: 9, color: "#556a84" }}>Last 8 trades</span>
                    </div>

                    {(paper.trades || []).length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {(paper.trades || []).slice(0, 8).map((trade) => (
                          <div key={trade.id} style={{
                            borderBottom: "1px solid #0e1a29", paddingBottom: 8,
                            display: "grid", gridTemplateColumns: "1fr auto", gap: "4px"
                          }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>
                                <span style={{
                                  color: trade.side === "buy" ? "#00e5a0" : "#ef4444",
                                  marginRight: 6, textTransform: "uppercase", fontSize: 9, fontWeight: 800,
                                  background: trade.side === "buy" ? "#00e5a015" : "#ef444415",
                                  padding: "2px 6px", borderRadius: 4
                                }}>
                                  {trade.side}
                                </span>
                                {trade.name || trade.isin}
                              </div>
                              <div style={{ fontSize: 9, color: "#556a84", marginTop: 4 }}>
                                {trade.is_option && trade.expiry ? (
                                  <div style={{ marginBottom: 4 }}>
                                    <span style={{ color: "#8899aa" }}>Expiry: <span style={{ color: "#cde" }}>{trade.expiry}</span></span>
                                    <span style={{ color: "#ffb077", marginLeft: 4 }}>({getDaysRemaining(trade.expiry)})</span>
                                  </div>
                                ) : null}
                                {formatExactDateTime(trade.created_at)} ({formatPreciseRelativeTime(trade.created_at)})
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#cde", fontFamily: "'Space Mono', monospace" }}>
                                {formatINR(trade.gross_value)}
                              </div>
                              <div style={{ fontSize: 9, color: "#556a84", marginTop: 4 }}>
                                {roundQty(trade.quantity)} qty @ {formatINR(trade.price)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: "center", padding: "20px 10px",
                        color: "#556a84", fontSize: 11
                      }}>
                        No trades logged yet.
                      </div>
                    )}
                  </div>

                </div>

              </div>
            </div>
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
                <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1 }}>PAPER TRADE · QUANTITY BASED</div>
                <div style={{ fontSize: 12, color: "#00e5a0", fontWeight: 700 }}>Cash: {formatINR(paper.cash_balance)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input
                  type="number" min="1" step="1" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)}
                  placeholder="Quantity (shares)"
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
              {tradeAmount && (
                <div style={{ fontSize: 11, color: "#8899aa" }}>
                  Est. Cost: <span style={{ color: "#00e5a0", fontWeight: 600 }}>{formatINR(Number(tradeAmount) * Number(tradePrice || todayPrice || data?.lastPrice || 0))}</span>
                </div>
              )}
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
                <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>LAST 10 DAYS + NEXT 1 DAY · ACTUAL & PREDICTED</span>
                <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                  <span style={{ color: "#4a9eff" }}>── Actual</span>
                  <span style={{ color: "#00e5a0" }}>── Predicted</span>
                  <span style={{ color: "#7cc8ad" }}>·· Range</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1a2a3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis type="number" dataKey="ts" scale="time" domain={["dataMin", "dataMax"]} tick={{ fill: "#445566", fontSize: 10 }} tickFormatter={(v) => formatDateLabel(Number(v))} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v)} width={68} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={latestActualTs} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />
                  <Line type="linear" dataKey="upper" stroke="#7cc8ad" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={true} />
                  <Line type="linear" dataKey="actual" stroke="#4a9eff" strokeWidth={2} dot={chartData.length <= 120} connectNulls={false} />
                  <Line type="linear" dataKey="predicted" stroke="#00e5a0" strokeWidth={2} dot={chartData.length <= 120} connectNulls={true} />
                  <Line type="linear" dataKey="lower" stroke="#7cc8ad" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Prediction Details */}
            <div style={{ background: "#0a1520", border: "1px solid #1a2a3a", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: "#445566", letterSpacing: 2, marginBottom: 14 }}>PREDICTION DETAILS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Next Day Range", value: `${formatINR(data.p10)} - ${formatINR(data.p90)}`, note: "p10 to p90" },
                  { label: "Backtest MAE", value: formatINR(avgBacktestAbsError), note: `${summary.rows || backtestRows.length || 0} walk-forward rows` },
                  { label: "Backtest MAPE", value: formatPercent(summary.mape ?? data.mape), note: "Mean absolute %" },
                  { label: "Direction Hit", value: formatPercent(directionalAccuracy, 1), note: "High vs prior high" },
                  { label: "Range Cover", value: formatPercent(intervalCoverage, 1), note: "Actual inside range" },
                  { label: "Model Edge", value: formatPercent(modelEdgePct, 1), note: "vs simple baseline" },
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

              <div style={{ border: "1px solid #1a2a3a", borderRadius: 8, overflow: "hidden", marginTop: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 0, background: "#081321", color: "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Backtest</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Actual</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Predicted</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid #1a2a3a" }}>Error</div>
                  <div style={{ padding: "10px 12px" }}>Hit</div>
                </div>
                {backtestRows.length ? (
                  backtestRows.map((row) => (
                    <div key={`bt-${row.ts}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 0, borderTop: "1px solid #1a2a3a", fontSize: 12 }}>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid #1a2a3a", color: "#9bb0c4" }}>{row.dateLabel}</div>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid #1a2a3a", color: "#4a9eff" }}>{formatINR(row.actual)}</div>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid #1a2a3a", color: "#00e5a0" }}>{formatINR(row.predicted)}</div>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid #1a2a3a", color: "#facc15" }}>
                        {formatINR(row.absError)} {Number.isFinite(row.errorPct) ? `(${formatPercent(row.errorPct, 1)})` : ""}
                      </div>
                      <div style={{ padding: "9px 12px", color: row.directionalHit ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                        {row.directionalHit ? "YES" : "NO"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "12px", color: "#556677", fontSize: 12 }}>No backtest data available.</div>
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
                  <div style={{ width: `${Math.max(0, Math.min(100, Number(data.trendStrength) || 0))}%`, height: "100%", background: trendColor, borderRadius: 3, transition: "width 0.8s" }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: trendColor, marginTop: 3 }}>{Math.round(Number(data.trendStrength) || 0)}%</div>
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
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#00e5a0", fontFamily: "'Space Mono', monospace" }}>{Math.round(Number(data.confidence) || 0)}%</div>
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
