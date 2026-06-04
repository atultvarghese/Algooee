import { themes } from "./theme";
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Hooks & Utils
import useStocks from "./hooks/useStocks";
import usePaperTrade from "./hooks/usePapertrade";
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
// Components
import { RiskMeter, ConfidenceRing, CustomTooltip } from "./components/CommonWidgets";
import StockCard from "./components/StockCard";
import OptionsChainView from "./components/OptionsChainView";
import LoginView from "./components/LoginView";
import UserManagementView from "./components/UserManagementView";

function DashboardContent({ currentUser, onLogout }) {
  const [activePage, setActivePage] = useState("stock");
  const [optionUnderlying, setOptionUnderlying] = useState("NIFTY");
  const [selectedOptionContract, setSelectedOptionContract] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(window.innerWidth <= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [themeMode, setThemeMode] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    localStorage.setItem("theme", themeMode);
  }, [themeMode]);

  const theme = themeMode === "dark"
    ? {
      bg: "#060e17",
      card: "#07101a",
      card2: "#0a1520",
      input: "#060e17",
      border: "#1a2a3a",
      text: "#cde",
      text2: "#8899aa",
      text3: "#667788"
    }
    : {
      bg: "#f5f7fb",
      card: "#ffffff",
      card2: "#ffffff",
      input: "#ffffff",
      border: "#dbe3ee",
      text: "#111827",
      text2: "#6b7280",
      text3: "#94a3b8"
    };
  const glassCard =
    themeMode === "light"
      ? {
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.45)",
        boxShadow: "0 8px 32px rgba(31,38,135,0.12)"
      }
      : {
        background: theme.card2,
        border: `1px solid ${theme.border}`
      };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Local Form UI States
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [adminMobileTab, setAdminMobileTab] = useState("holdings");

  // Upstox Live Search UI States
  const [liveQuery, setLiveQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Connect Hooks
  const {
    stocks, selected, setSelected, stockData, loading, remoteStocks,
    stockBusy, stockError, stockNotice, addWatchlistStock, removeWatchlistStock,
    loadPrediction, predictLoading, predictError
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
      const token = localStorage.getItem("token");
      fetch(`${API_BASE}/api/instruments/search?q=${encodeURIComponent(liveQuery)}`, {
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      })
        .then((res) => {
          if (res.status === 401) {
            localStorage.removeItem("token");
            window.location.reload();
            throw new Error("Unauthorized");
          }
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
      minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      display: "grid", gridTemplateColumns: (isMobile || activePage === "users") ? "1fr" : "280px 1fr", gridTemplateRows: isMobile ? "auto auto 1fr" : "60px 1fr"
    }}>
      {/* Header */}
      <div style={{
        gridColumn: "1/-1", display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        padding: isMobile ? "12px 14px" : "0 28px",
        borderBottom: `1px solid ${theme.border}`, background: theme.card,
        gap: isMobile ? 8 : 16,
        height: isMobile ? "auto" : "60px"
      }}>
        {!isMobile ? (
          // Desktop Header View
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src="/logo.png" alt="ALGOOEE" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
              <div>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: theme.text, letterSpacing: -0.5 }}>Algooee</span>
                <span style={{ fontSize: 10, color: theme.text2, marginLeft: 8, letterSpacing: 2 }}>STOCK INTELLIGENCE</span>
              </div>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16
            }}>
              <div style={{ display: "flex", gap: 6 }}>
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
                {currentUser?.role === "admin" && (
                  <button
                    onClick={() => setActivePage("users")}
                    style={{
                      background: activePage === "users" ? "#00e5a022" : "#0a1520",
                      color: activePage === "users" ? "#00e5a0" : "#778899",
                      border: `1px solid ${activePage === "users" ? "#00e5a055" : "#1a2a3a"}`,
                      borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    USER MANAGEMENT
                  </button>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* User Pill */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: themeMode === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 20,
                  padding: "5px 10px",
                  fontSize: 11,
                  color: theme.text2
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text2, opacity: 0.8 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span style={{ color: theme.text, fontWeight: 600, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentUser?.email}
                  </span>
                </div>

                {/* Wallet Pill */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: themeMode === "light" ? "rgba(0, 229, 160, 0.08)" : "rgba(0, 229, 160, 0.05)",
                  border: `1px solid ${themeMode === "light" ? "rgba(0, 229, 160, 0.3)" : "rgba(0, 229, 160, 0.2)"}`,
                  borderRadius: 20,
                  padding: "5px 10px",
                  fontSize: 11,
                  color: theme.text2
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#00e5a0" }}>
                    <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                    <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                    <path d="M18 12a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4v-6Z" />
                  </svg>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: themeMode === "light" ? "#009e6f" : "#8899aa" }}>Cash:</span>
                  <span style={{ color: "#00e5a0", fontWeight: 700 }}>
                    {formatINR(paper.cash_balance)}
                  </span>
                </div>
                <button
                  onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
                  style={{
                    background: theme.card,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {themeMode === "dark" ? "☀️ LIGHT" : "🌙 DARK"}
                </button>
                <button
                  onClick={onLogout}
                  style={{
                    background: "#2a1218", color: "#f87171", border: "1px solid #f8717155",
                    borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#2a1218"; e.currentTarget.style.color = "#f87171"; }}
                >
                  LOGOUT
                </button>
              </div>
            </div>
          </>
        ) : (
          // Mobile Header View
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Top row: Logo, Theme, Watchlist, Logout */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <img src="/logo.png" alt="ALGOOEE" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: theme.text }}>Algooee</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {activePage === "stock" && (
                  <button
                    onClick={() => setShowWatchlist(!showWatchlist)}
                    style={{
                      background: theme.card2, color: "#778899", border: `1px solid ${theme.border}`,
                      borderRadius: 6, padding: "6px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer"
                    }}
                  >
                    {showWatchlist ? "DETAILS" : "WATCHLIST"}
                  </button>
                )}
                <button
                  onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
                  style={{
                    background: theme.card, color: theme.text, border: `1px solid ${theme.border}`,
                    borderRadius: 6, padding: "6px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer"
                  }}
                >
                  {themeMode === "dark" ? "☀️" : "🌙"}
                </button>
                <button
                  onClick={onLogout}
                  style={{
                    background: "#2a1218", color: "#f87171", border: "1px solid #f8717155",
                    borderRadius: 6, padding: "6px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer"
                  }}
                >
                  LOGOUT
                </button>
              </div>
            </div>

            {/* Tabs Segmented Row */}
            <div style={{
              display: "flex",
              background: themeMode === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: 2
            }}>
              {[
                { id: "stock", label: "Stock" },
                { id: "options", label: "Options" },
                { id: "admin", label: "Admin" },
                ...(currentUser?.role === "admin" ? [{ id: "users", label: "Users" }] : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActivePage(tab.id);
                    if (tab.id === "stock") setShowWatchlist(false);
                  }}
                  style={{
                    flex: 1,
                    background: activePage === tab.id ? (themeMode === "light" ? "#fff" : "rgba(255,255,255,0.08)") : "transparent",
                    color: activePage === tab.id ? theme.text : theme.text2,
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 4px",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "center",
                    boxShadow: activePage === tab.id && themeMode === "light" ? "0 2px 4px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  {tab.label.toUpperCase()}
                </button>
              ))}
            </div>

            {/* User status row */}
            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              {/* User Pill */}
              <div style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: themeMode === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${theme.border}`,
                borderRadius: 16,
                padding: "6px 8px",
                fontSize: 10,
                color: theme.text2,
                overflow: "hidden"
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text2, opacity: 0.8, flexShrink: 0 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span style={{ color: theme.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentUser?.email}
                </span>
              </div>

              {/* Wallet Pill */}
              <div style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: themeMode === "light" ? "rgba(0, 229, 160, 0.08)" : "rgba(0, 229, 160, 0.05)",
                border: `1px solid ${themeMode === "light" ? "rgba(0, 229, 160, 0.3)" : "rgba(0, 229, 160, 0.2)"}`,
                borderRadius: 16,
                padding: "6px 8px",
                fontSize: 10,
                color: theme.text2,
                flexShrink: 0
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#00e5a0", flexShrink: 0 }}>
                  <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                  <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                  <path d="M18 12a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4v-6Z" />
                </svg>
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: themeMode === "light" ? "#009e6f" : "#8899aa", flexShrink: 0 }}>Cash:</span>
                <span style={{ color: "#00e5a0", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatINR(paper.cash_balance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      {((!isMobile && activePage !== "users") || (isMobile && activePage === "stock" && showWatchlist)) && (
        <div style={{
          borderRight: isMobile ? "none" : `1px solid ${theme.border}`,
          borderBottom: isMobile ? `1px solid ${theme.border}` : "none",
          padding: 16, overflowY: "auto", background: theme.card,
          height: isMobile ? "calc(100vh - 60px)" : "auto",
          maxHeight: "none"
        }}>
          <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 12, paddingLeft: 4 }}>WATCHLIST</div>
          <div style={{ marginBottom: 10 }}>
            <input
              type="text" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Search by name or ISIN"
              style={{ width: "100%", background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.input, border: `1px solid ${theme.border}`, color: "#cde", borderRadius: 8, padding: "9px 10px", fontSize: 12, outline: "none" }}
            />
          </div>
          <div style={{ ...glassCard, borderRadius: 16, padding: 10, marginBottom: 12, position: "relative" }}>
            <div style={{ fontSize: 10, color: "#556677", marginBottom: 8, letterSpacing: 1 }}>ADD STOCK</div>
            <div style={{ position: "relative" }}>
              <input
                type="text" value={liveQuery} onChange={(e) => setLiveQuery(e.target.value)}
                placeholder="Search Live Upstox Equities..."
                style={{ width: "100%", background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.input, border: `1px solid ${theme.border}`, color: "#cde", borderRadius: 8, padding: "8px 10px", fontSize: 11, outline: "none" }}
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
                background: theme.card, border: "1px solid #142234",
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
                      <div style={{ color: theme.text, fontWeight: 600 }}>{suggestion.trading_symbol}</div>
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
                background: theme.card, border: "1px solid #142234",
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
              <StockCard key={s.ticker} ticker={s.ticker} themeMode={themeMode} name={s.name} meta={s} selected={selected === s.ticker}
                data={stockData[s.ticker]} onClick={() => {
                  setSelected(s.ticker);
                  if (activePage === "options") {
                    setOptionUnderlying(s.ticker);
                  } else {
                    setActivePage("stock");
                    setShowWatchlist(false);
                  }
                }} onRemove={() => removeWatchlistStock(s.ticker)} />
            ))}
            {!visibleStocks.length && <div style={{ color: "#556677", fontSize: 11, padding: "6px 4px" }}>No stocks found.</div>}
          </div>
        </div>
      )}

      {/* Main content */}
      {(!isMobile || activePage !== "stock" || !showWatchlist) && (
        <div style={{ overflowY: "auto", padding: isMobile ? "16px 12px" : "24px 28px" }}>
          {isMobile && activePage === "stock" && !showWatchlist && (
            <button
              onClick={() => setShowWatchlist(true)}
              style={{
                background: "transparent",
                color: "#00e5a0",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 16,
                padding: "4px 0"
              }}
            >
              ← Back to Watchlist
            </button>
          )}
          {activePage === "users" ? (
            <UserManagementView API_BASE={API_BASE} currentUser={currentUser} />
          ) : activePage === "options" ? (
            <OptionsChainView
              stocks={stocks}
              selectedUnderlying={optionUnderlying}
              themeMode={themeMode}
              theme={theme}
              setSelectedUnderlying={setOptionUnderlying}
              paper={paper}
              paperBusy={paperBusy}
              placePaperOrder={placePaperOrder}
              formatINR={formatINR}
              selectedOptionContract={selectedOptionContract}
              setSelectedOptionContract={setSelectedOptionContract}
              isMobile={isMobile}
            />
          ) : activePage === "admin" ? (
            paperLoading && !paperPortfolio ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", minHeight: "250px", gap: 16 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  border: "3px solid rgba(0, 229, 160, 0.15)",
                  borderTop: "3px solid #00e5a0",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite"
                }} />
                <div style={{ color: theme.text2, fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>
                  Loading paper trading account...
                </div>
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
                {isMobile ? (
                  // Mobile tabbed view
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Mobile Tab Buttons */}
                    <div style={{
                      display: "flex",
                      background: themeMode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      padding: 4,
                      marginBottom: 8
                    }}>
                      {[
                        { id: "holdings", label: "Holdings" },
                        { id: "trades", label: "Activity Log" },
                        { id: "controls", label: "Admin Controls" }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setAdminMobileTab(tab.id)}
                          style={{
                            flex: 1,
                            background: adminMobileTab === tab.id ? (themeMode === "light" ? "#ffffff" : "rgba(255,255,255,0.08)") : "transparent",
                            color: adminMobileTab === tab.id ? theme.text : theme.text2,
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            boxShadow: adminMobileTab === tab.id && themeMode === "light" ? "0 2px 8px rgba(0,0,0,0.08)" : "none"
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Contents */}
                    {adminMobileTab === "holdings" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Account Summary Card */}
                        <div style={{
                          ...glassCard,
                          borderRadius: 16,
                          padding: "20px",
                          background: themeMode === "light" ? "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)" : "linear-gradient(135deg, #0e1e2f 0%, #060e17 100%)",
                          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
                        }}>
                          <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                            Account Net Worth
                          </div>
                          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: theme.text, marginBottom: 16 }}>
                            {formatINR(paper.cash_balance + paper.market_value)}
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 12px", borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
                            <div>
                              <div style={{ fontSize: 9, color: theme.text2, textTransform: "uppercase", marginBottom: 2 }}>Cash Balance</div>
                              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#00e5a0" }}>
                                {formatINR(paper.cash_balance)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: theme.text2, textTransform: "uppercase", marginBottom: 2 }}>Total Invested</div>
                              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#9fe7ff" }}>
                                {formatINR(paper.invested_cost)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: theme.text2, textTransform: "uppercase", marginBottom: 2 }}>Market Value</div>
                              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#4a9eff" }}>
                                {formatINR(paper.market_value)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: theme.text2, textTransform: "uppercase", marginBottom: 2 }}>Total P&L</div>
                              <div style={{
                                fontFamily: "'Space Mono', monospace",
                                fontSize: 13,
                                fontWeight: 700,
                                color: (paper.total_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444"
                              }}>
                                {(paper.total_pnl ?? 0) >= 0 ? "▲" : "▼"} {formatINR(Math.abs(paper.total_pnl))}
                                <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 500 }}>
                                  ({paper.invested_cost > 0 ? (((paper.total_pnl ?? 0) / paper.invested_cost) * 100).toFixed(2) : "0.00"}%)
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Open Positions list */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: theme.text2, letterSpacing: 1, fontWeight: 700 }}>PORTFOLIO HOLDINGS</div>
                            <div style={{ fontSize: 10, color: theme.text3 }}>{(paper.positions || []).length} active positions</div>
                          </div>

                          {(paper.positions || []).length ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              {(paper.positions || []).map((pos) => {
                                const isProfit = (pos.unrealized_pnl ?? 0) >= 0;
                                const isDayProfit = (pos.day_pnl ?? 0) >= 0;
                                const pnlPct = pos.cost_value > 0 ? ((pos.unrealized_pnl ?? 0) / pos.cost_value) * 100 : 0;
                                const dayPnlPct = pos.prev_close > 0 ? ((pos.current_price - pos.prev_close) / pos.prev_close) * 100 : 0;

                                return (
                                  <div
                                    key={pos.id || pos.isin}
                                    style={{
                                      background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.card2,
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: 14,
                                      padding: 16,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 12,
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.12)"
                                    }}
                                  >
                                    {/* Header */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                      <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{pos.name}</span>
                                          <span style={{
                                            fontSize: 8,
                                            background: pos.is_option ? "rgba(255,176,119,0.1)" : "rgba(0,229,160,0.1)",
                                            padding: "2px 6px",
                                            borderRadius: 4,
                                            color: pos.is_option ? "#ffb077" : "#00e5a0",
                                            fontWeight: 700,
                                            textTransform: "uppercase"
                                          }}>
                                            {pos.is_option ? "Option" : "Equity"}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: 9, color: theme.text3, marginTop: 4 }}>{pos.isin}</div>
                                      </div>
                                      <div style={{ textAlign: "right" }}>
                                        <div style={{
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: isProfit ? "#00e5a0" : "#ef4444",
                                          fontFamily: "'Space Mono', monospace"
                                        }}>
                                          {isProfit ? "▲" : "▼"} {formatINR(Math.abs(pos.unrealized_pnl))}
                                        </div>
                                        <div style={{
                                          fontSize: 9,
                                          fontWeight: 600,
                                          color: isProfit ? "#00e5a0" : "#ef4444",
                                          marginTop: 2
                                        }}>
                                          {isProfit ? "+" : ""}{pnlPct.toFixed(2)}%
                                        </div>
                                      </div>
                                    </div>

                                    {/* Expiry Badge if Option */}
                                    {pos.is_option && pos.expiry && (
                                      <div style={{
                                        background: themeMode === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
                                        borderRadius: 6,
                                        padding: "6px 10px",
                                        fontSize: 10,
                                        color: "#ffb077",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                      }}>
                                        <span>Expiry Contract</span>
                                        <span style={{ fontWeight: 600 }}>{pos.expiry} ({getDaysRemaining(pos.expiry)})</span>
                                      </div>
                                    )}

                                    {/* Metrics Grid */}
                                    <div style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(3, 1fr)",
                                      gap: "10px 8px",
                                      borderTop: `1px solid ${theme.border}`,
                                      borderBottom: `1px solid ${theme.border}`,
                                      padding: "10px 0"
                                    }}>
                                      <div>
                                        <div style={{ fontSize: 9, color: theme.text2, marginBottom: 2 }}>Qty</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: theme.text, fontFamily: "'Space Mono', monospace" }}>{pos.quantity}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 9, color: theme.text2, marginBottom: 2 }}>Avg Cost</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: theme.text, fontFamily: "'Space Mono', monospace" }}>{formatINR(pos.avg_price)}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 9, color: theme.text2, marginBottom: 2 }}>LTP</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: theme.text, fontFamily: "'Space Mono', monospace" }}>{formatINR(pos.current_price)}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 9, color: theme.text2, marginBottom: 2 }}>Amt Invested</div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.text2, fontFamily: "'Space Mono', monospace" }}>{formatINR(pos.cost_value)}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 9, color: theme.text2, marginBottom: 2 }}>Market Value</div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.text, fontFamily: "'Space Mono', monospace" }}>{formatINR(pos.market_value)}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 9, color: theme.text2, marginBottom: 2 }}>Day Return</div>
                                        <div style={{
                                          fontSize: 11,
                                          fontWeight: 600,
                                          color: isDayProfit ? "#00e5a0" : "#ef4444",
                                          fontFamily: "'Space Mono', monospace"
                                        }}>
                                          {isDayProfit ? "+" : ""}{dayPnlPct.toFixed(2)}%
                                        </div>
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                      <div style={{ fontSize: 8, color: theme.text3, lineHeight: "1.3" }}>
                                        <div>Updated: {formatExactDateTime(pos.updated_at)}</div>
                                        <div style={{ color: "#00e5a0", marginTop: 2 }}>{formatPreciseRelativeTime(pos.updated_at)}</div>
                                      </div>
                                      <div style={{ display: "flex", gap: 8 }}>
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
                                              setShowWatchlist(false);
                                            }
                                          }}
                                          disabled={paperBusy}
                                          style={{
                                            background: "#0f2a24",
                                            color: "#4ade80",
                                            border: "1px solid #4ade8055",
                                            borderRadius: 6,
                                            padding: "6px 12px",
                                            fontSize: 10,
                                            fontWeight: 700,
                                            cursor: paperBusy ? "not-allowed" : "pointer",
                                            opacity: paperBusy ? 0.5 : 1,
                                            transition: "all 0.2s ease"
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
                                            padding: "6px 12px",
                                            fontSize: 10,
                                            fontWeight: 700,
                                            cursor: paperBusy ? "not-allowed" : "pointer",
                                            opacity: paperBusy ? 0.5 : 1,
                                            transition: "all 0.2s ease"
                                          }}
                                        >
                                          SELL
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{
                              textAlign: "center", padding: "40px 20px",
                              border: `1px dashed ${theme.border}`, borderRadius: 12,
                              color: theme.text2, fontSize: 12
                            }}>
                              No open holdings in your paper portfolio yet. Go to Stock Page to Buy stocks.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {adminMobileTab === "trades" && (
                      <div style={{
                        ...glassCard,
                        borderRadius: 16,
                        padding: "20px"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>RECENT TRANSACTION LOG</div>
                          <span style={{ fontSize: 9, color: theme.text3 }}>Last 15 trades</span>
                        </div>

                        {(paper.trades || []).length ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {(paper.trades || []).slice(0, 15).map((trade) => (
                              <div key={trade.id} style={{
                                background: themeMode === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.01)",
                                border: `1px solid ${theme.border}`,
                                borderRadius: 10,
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{
                                      color: trade.side === "buy" ? "#00e5a0" : "#ef4444",
                                      textTransform: "uppercase", fontSize: 9, fontWeight: 800,
                                      background: trade.side === "buy" ? "rgba(0, 229, 160, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                      padding: "3px 6px", borderRadius: 4,
                                      border: `1px solid ${trade.side === "buy" ? "rgba(0, 229, 160, 0.2)" : "rgba(239, 68, 68, 0.2)"}`
                                    }}>
                                      {trade.side}
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
                                      {trade.name || trade.isin}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, fontFamily: "'Space Mono', monospace" }}>
                                    {formatINR(trade.gross_value)}
                                  </div>
                                </div>

                                {trade.is_option && trade.expiry && (
                                  <div style={{ fontSize: 9, color: "#ffb077", fontWeight: 600 }}>
                                    Expiry: {trade.expiry} ({getDaysRemaining(trade.expiry)})
                                  </div>
                                )}

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: theme.text2, borderTop: `1px solid ${theme.border}`, paddingTop: 6 }}>
                                  <div>Qty: {roundQty(trade.quantity)} @ {formatINR(trade.price)}</div>
                                  <div style={{ fontSize: 8, color: theme.text3 }}>
                                    {formatExactDateTime(trade.created_at)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ textAlign: "center", padding: "40px 20px", color: theme.text2, fontSize: 11 }}>
                            No trades logged yet.
                          </div>
                        )}
                      </div>
                    )}

                    {adminMobileTab === "controls" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {/* Admin Funding / Reset Control */}
                        <div style={{
                          ...glassCard,
                          borderRadius: 16,
                          padding: "20px"
                        }}>
                          <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700, marginBottom: 14 }}>ADMIN CONTROLS</div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 10, color: theme.text2, marginBottom: 6, fontWeight: 600 }}>ADD FUNDS (INR)</label>
                              <input
                                type="number" min="0" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
                                placeholder="Amount in INR (e.g. 50000)"
                                style={{
                                  width: "100%", background: themeMode === "light" ? "#fff" : "#050b12", border: `1px solid ${theme.border}`,
                                  color: theme.text, borderRadius: 8, padding: "10px 12px",
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

                            <div style={{ borderTop: `1px solid ${theme.border}`, margin: "8px 0" }} />

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

                          <div style={{ marginTop: 16, fontSize: 10, color: theme.text2, lineHeight: "1.4", borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span>Total funded so far:</span>
                              <span style={{ color: theme.text, fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{formatINR(paper.total_funded)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>P/L vs funded:</span>
                              <span style={{ color: (paper.pnl_vs_funded ?? 0) >= 0 ? "#00e5a0" : "#ef4444", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>
                                {formatINR(paper.pnl_vs_funded)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Desktop view (original layout)
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
                            ...glassCard,
                            borderRadius: 16,
                            padding: "16px"
                          }}>
                            <div style={{ fontSize: 10, color: "#556a84", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
                            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.value}</div>
                            <div style={{ fontSize: 10, color: "#3a4e68" }}>{item.desc}</div>
                          </div>
                        ))}
                      </div>

                      {/* Open Positions Card */}
                      <div style={{
                        ...glassCard,
                        borderRadius: 16,
                        padding: "20px",
                        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>PORTFOLIO HOLDINGS</div>
                          <div style={{ fontSize: 10, color: "#556a84" }}>{(paper.positions || []).length} active assets</div>
                        </div>

                        {(paper.positions || []).length ? (
                          <div style={{ overflowX: "auto" }}>
                            <div style={{ overflow: "hidden", minWidth: "auto" }}>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "1.3fr 1.1fr 1.0fr 0.9fr 1.0fr 1.2fr 0.9fr",
                                background: "#0c1827", color: "#556a84",
                                fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase"
                              }}>
                                <div style={{ padding: "12px 14px" }}>Asset</div>
                                <div style={{ padding: "12px 14px" }}>Amt Purchased</div>
                                <div style={{ padding: "12px 14px" }}>Avg Cost</div>
                                <div style={{ padding: "12px 14px" }}>Current</div>
                                <div style={{ padding: "12px 14px" }}>Unrealized P/L</div>
                                <div style={{ padding: "12px 14px" }}>Purchase Date & Recency</div>
                                <div style={{ padding: "12px 14px", textAlign: "center" }}>Action</div>
                              </div>
                              {(paper.positions || []).map((pos) => (
                                <div key={pos.id || pos.isin} style={{
                                  display: "grid",
                                  gridTemplateColumns: "1.3fr 1.1fr 1.0fr 0.9fr 1.0fr 1.2fr 0.9fr",
                                  borderTop: "1px solid #142234", fontSize: 12,
                                  background: theme.card, color: "#cde",
                                  alignItems: "center"
                                }}>
                                  <div style={{ padding: "12px 14px" }}>
                                    <div style={{ fontWeight: 600, color: theme.text }}>{pos.name}</div>
                                    <div style={{ fontSize: 9, color: "#556a84", marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                                      {pos.is_option && pos.expiry ? (
                                        <>
                                          <span style={{ color: theme.text2 }}>Expiry: <span style={{ color: "#cde" }}>{pos.expiry}</span></span>
                                          <span style={{ color: "#ffb077", fontWeight: 500 }}>({getDaysRemaining(pos.expiry)})</span>
                                        </>
                                      ) : (
                                        pos.isin
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ padding: "12px 14px", fontFamily: "'Space Mono', monospace", color: "#9bb0c4" }}>
                                    {formatINR(pos.cost_value)}
                                  </div>
                                  <div style={{ padding: "12px 14px", fontFamily: "'Space Mono', monospace", color: "#9bb0c4" }}>
                                    {formatINR(pos.avg_price)}
                                  </div>
                                  <div style={{ padding: "12px 14px", fontFamily: "'Space Mono', monospace", color: theme.text }}>
                                    {formatINR(pos.current_price)}
                                  </div>
                                  <div style={{
                                    padding: "12px 14px",
                                    fontFamily: "'Space Mono', monospace",
                                    color: (pos.unrealized_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444",
                                    fontWeight: 600
                                  }}>
                                    {formatINR(pos.unrealized_pnl)}
                                  </div>
                                  <div style={{ padding: "12px 14px", color: "#9bb0c4" }}>
                                    <div style={{ color: theme.text, fontFamily: "'Space Mono', monospace" }}>{formatExactDateTime(pos.updated_at)}</div>
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
                                          setShowWatchlist(false);
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
                                    >
                                      SELL
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
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

                    {/* Right Side: Admin Controls & Transaction Log */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      {/* Admin Funding / Reset Control */}
                      <div style={{
                        ...glassCard,
                        borderRadius: 16,
                        padding: "20px"
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
                          Total funded so far: <span style={{ color: theme.text, fontFamily: "'Space Mono', monospace" }}>{formatINR(paper.total_funded)}</span><br />
                          P/L vs funded: <span style={{ color: (paper.pnl_vs_funded ?? 0) >= 0 ? "#00e5a0" : "#ef4444", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{formatINR(paper.pnl_vs_funded)}</span>
                        </div>
                      </div>

                      {/* Unified Activity Log (Cleaned up trades / ledger) */}
                      <div style={{
                        ...glassCard,
                        borderRadius: 16,
                        padding: "20px"
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
                                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.text }}>
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
                                        <span style={{ color: theme.text2 }}>Expiry: <span style={{ color: "#cde" }}>{trade.expiry}</span></span>
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
                )}
              </div>
            )
          ) : loading && !data ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", minHeight: "250px", gap: 16 }}>
              <div style={{
                width: 40,
                height: 40,
                border: "3px solid rgba(0, 229, 160, 0.15)",
                borderTop: "3px solid #00e5a0",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }} />
              <div style={{ color: theme.text2, fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>
                Loading stock intelligence...
              </div>
            </div>
          ) : data ? (
            <>
              {(paperError || paperNotice) && (
                <div style={{ marginBottom: 16, borderRadius: 10, padding: "10px 12px", border: `1px solid ${paperError ? "#f8717155" : "#00e5a055"}`, background: paperError ? "#2a1218" : "#0f2a24", color: paperError ? "#fca5a5" : "#7cfccf", fontSize: 12 }}>
                  {paperError || paperNotice}
                </div>
              )}

              {/* Stock header */}
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: isMobile ? 12 : 0, marginBottom: 24 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    {(() => {
                      const metaObj = (remoteStocks || stocks).find(s => s.ticker === selected) || {};
                      const displayName = metaObj.name || data?.name || selected;
                      return (
                        <>
                          <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, margin: 0, color: theme.text }}>{displayName}</h1>
                          <span style={{ fontSize: 14, color: "#667788" }}>{selected}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, color: theme.text, fontWeight: 700 }}>{formatINR(todayPrice ?? data?.lastPrice)}</div>
                      <div style={{ fontSize: 12, color: theme.text2, marginTop: 4 }}>
                        Today: {formatINR(todayPrice)}{data?.hasPrediction ? ` · Predicted: ${formatINR(predictedVal)}` : ""}
                      </div>
                    </div>
                    <span style={{ color: data?.changePct >= 0 ? "#4ade80" : "#f87171", fontSize: 14, fontWeight: 600 }}>
                      {data?.changePct >= 0 ? "▲" : "▼"} {Math.abs(data?.change ?? 0)} ({Math.abs(data?.changePct ?? 0)}%)
                    </span>
                    <span style={{ fontSize: 11, color: theme.text2 }}>15D</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {data?.hasPrediction && <ConfidenceRing value={data.confidence} />}
                </div>
              </div>

              {/* Paper Trade */}
              <div style={{ ...glassCard, borderRadius: 16, padding: 18, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1 }}>PAPER TRADE · QUANTITY BASED</div>
                  <div style={{ fontSize: 12, color: "#00e5a0", fontWeight: 700 }}>Cash: {formatINR(paper.cash_balance)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10, marginBottom: 10 }}>
                  <input
                    type="number" min="1" step="1" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)}
                    placeholder="Quantity (shares)"
                    style={{ background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.input, border: `1px solid ${theme.border}`, color: "#cde", borderRadius: 8, padding: "10px 12px", width: isMobile ? "100%" : 220, outline: "none" }}
                  />
                  <input
                    type="number" min="0" step="0.01" value={tradePrice} onChange={(e) => setTradePrice(e.target.value)}
                    placeholder="Execution price"
                    style={{ background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.input, border: `1px solid ${theme.border}`, color: "#cde", borderRadius: 8, padding: "10px 12px", width: isMobile ? "100%" : 170, outline: "none" }}
                  />
                  <button
                    onClick={() => {
                      const live = Number(todayPrice ?? data?.lastPrice);
                      if (Number.isFinite(live) && live > 0) setTradePrice(live.toFixed(2));
                    }}
                    style={{ background: "#081321", color: "#9bb0c4", border: `1px solid ${theme.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 11, cursor: "pointer" }}
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
                  <div style={{ fontSize: 11, color: theme.text2 }}>
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
              <div style={{ ...glassCard, borderRadius: 16, padding: "20px 16px", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingRight: 8 }}>
                  <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>
                    {data?.hasPrediction ? "LAST 10 DAYS + NEXT 1 DAY · ACTUAL & PREDICTED" : "LAST 10 DAYS · HISTORICAL PRICE"}
                  </span>
                  <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                    <span style={{ color: "#4a9eff" }}>── Actual</span>
                    {data?.hasPrediction && <span style={{ color: "#00e5a0" }}>── Predicted</span>}
                    {data?.hasPrediction && <span style={{ color: "#7cc8ad" }}>·· Range</span>}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#1a2a3a" strokeDasharray="3 3" vertical={false} />
                    <XAxis type="number" dataKey="ts" scale="time" domain={["dataMin", "dataMax"]} tick={{ fill: "#445566", fontSize: 10 }} tickFormatter={(v) => formatDateLabel(Number(v))} tickLine={false} axisLine={false} minTickGap={28} />
                    <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v)} width={68} />
                    <Tooltip content={<CustomTooltip />} />
                    {data?.hasPrediction && <ReferenceLine x={latestActualTs} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />}
                    {data?.hasPrediction && <Line type="linear" dataKey="upper" stroke="#7cc8ad" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={true} />}
                    <Line type="linear" dataKey="actual" stroke="#4a9eff" strokeWidth={2} dot={chartData.length <= 120} connectNulls={false} />
                    {data?.hasPrediction && <Line type="linear" dataKey="predicted" stroke="#00e5a0" strokeWidth={2} dot={chartData.length <= 120} connectNulls={true} />}
                    {data?.hasPrediction && <Line type="linear" dataKey="lower" stroke="#7cc8ad" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={true} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Generate Predictions Card */}
              {!data?.hasPrediction && (
                <div style={{
                  background: themeMode === "light"
                    ? "linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)"
                    : "linear-gradient(135deg, #091726 0%, #0d1e30 100%)",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: "32px 24px",
                  marginBottom: 20,
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: themeMode === "light"
                    ? "0 8px 32px rgba(31,38,135,0.06)"
                    : "0 8px 32px rgba(0, 0, 0, 0.3)"
                }}>
                  <div style={{
                    position: "absolute",
                    top: -50,
                    right: -50,
                    width: 150,
                    height: 150,
                    background: "radial-gradient(circle, rgba(0, 229, 160, 0.1) 0%, transparent 70%)",
                    borderRadius: "50%"
                  }} />

                  <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, margin: "0 0 8px 0", letterSpacing: 0.5 }}>
                    AI Price Predictions & Advanced Signals
                  </h3>
                  <p style={{ fontSize: 12, color: theme.text2, maxWidth: 500, margin: "0 auto 20px auto", lineHeight: 1.6 }}>
                    Generate high-precision forecasts, walk-forward backtests, risk profiles, and technical indicators (RSI, MACD, EMAs) powered by our machine learning models.
                  </p>

                  <button
                    onClick={() => loadPrediction(selected)}
                    disabled={predictLoading}
                    style={{
                      background: predictLoading ? "transparent" : "linear-gradient(90deg, #00c6ff 0%, #0072ff 100%)",
                      color: "#fff",
                      border: predictLoading ? "1px solid #0072ff" : "none",
                      borderRadius: 8,
                      padding: "12px 24px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: predictLoading ? "not-allowed" : "pointer",
                      boxShadow: predictLoading ? "none" : "0 4px 15px rgba(0, 114, 255, 0.4)",
                      transition: "all 0.3s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    {predictLoading ? "GENERATING FORECAST..." : "RUN AI MODEL PREDICTION"}
                  </button>
                  {predictError && (
                    <div style={{ color: "#fca5a5", fontSize: 11, marginTop: 12 }}>
                      Error generating predictions: {predictError}
                    </div>
                  )}

                  <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                </div>
              )}

              {data?.hasPrediction && (
                <>
                  {/* Prediction Details */}
                  <div style={{ ...glassCard, borderRadius: 16, padding: 20, marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 14 }}>PREDICTION DETAILS</div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
                      {[
                        { label: "Next Day Range", value: `${formatINR(data.p10)} - ${formatINR(data.p90)}`, note: "p10 to p90" },
                        { label: "Backtest MAE", value: formatINR(avgBacktestAbsError), note: `${summary.rows || backtestRows.length || 0} walk-forward rows` },
                        { label: "Backtest MAPE", value: formatPercent(summary.mape ?? data.mape), note: "Mean absolute %" },
                        { label: "Direction Hit", value: formatPercent(directionalAccuracy, 1), note: "High vs prior high" },
                        { label: "Range Cover", value: formatPercent(intervalCoverage, 1), note: "Actual inside range" },
                        { label: "Model Edge", value: formatPercent(modelEdgePct, 1), note: "vs simple baseline" },
                      ].map((metric) => (
                        <div key={metric.label} style={{ background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.input, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 1, marginBottom: 6 }}>{metric.label}</div>
                          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{metric.value}</div>
                          <div style={{ fontSize: 10, color: "#667788" }}>{metric.note}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, background: themeMode === "light" ? "linear-gradient(135deg,#1e40af,#2563eb)" : "#081321", color: themeMode === "light" ? "#ffffff" : "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                        <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}` }}>Date</div>
                        <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}` }}>Predicted</div>
                        <div style={{ padding: "10px 12px" }}>Range</div>
                      </div>
                      {forecastRows.length ? (
                        forecastRows.map((row) => (
                          <div key={row.ts} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, borderTop: `1px solid ${theme.border}`, fontSize: 12 }}>
                            <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}`, color: "#9bb0c4" }}>{row.dateLabel}</div>
                            <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}`, color: "#00e5a0", fontWeight: 600 }}>{formatINR(row.price)}</div>
                            <div style={{ padding: "10px 12px", color: "#7cc8ad" }}>
                              {Number.isFinite(row.lower) && Number.isFinite(row.upper) ? `${formatINR(row.lower)} - ${formatINR(row.upper)}` : "—"}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "12px", color: "#556677", fontSize: 12 }}>No forecast data available.</div>
                      )}
                    </div>

                    <div style={{ overflowX: "auto" }}>
                      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden", minWidth: isMobile ? "500px" : "auto", marginTop: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 0, background: themeMode === "light" ? "linear-gradient(135deg,#1e40af,#2563eb)" : "#081321", color: themeMode === "light" ? "#ffffff" : "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                          <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}` }}>Backtest</div>
                          <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}` }}>Actual</div>
                          <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}` }}>Predicted</div>
                          <div style={{ padding: "10px 12px", borderRight: `1px solid ${theme.border}` }}>Error</div>
                          <div style={{ padding: "10px 12px" }}>Hit</div>
                        </div>
                        {backtestRows.length ? (
                          backtestRows.map((row) => (
                            <div key={`bt-${row.ts}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 0, borderTop: `1px solid ${theme.border}`, fontSize: 12 }}>
                              <div style={{ padding: "9px 12px", borderRight: `1px solid ${theme.border}`, color: "#9bb0c4" }}>{row.dateLabel}</div>
                              <div style={{ padding: "9px 12px", borderRight: `1px solid ${theme.border}`, color: "#4a9eff" }}>{formatINR(row.actual)}</div>
                              <div style={{ padding: "9px 12px", borderRight: `1px solid ${theme.border}`, color: "#00e5a0" }}>{formatINR(row.predicted)}</div>
                              <div style={{ padding: "9px 12px", borderRight: `1px solid ${theme.border}`, color: "#facc15" }}>
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
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
                    <div style={{ ...glassCard, borderRadius: 16, padding: 18 }}>
                      <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 12 }}>TREND ANALYSIS</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 22, color: trendColor, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{data.trend}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#556677", marginBottom: 6 }}>Strength</div>
                      <div style={{ height: 6, background: "#1e2d3d", borderRadius: 3 }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, Number(data.trendStrength) || 0))}%`, height: "100%", background: trendColor, borderRadius: 3, transition: "width 0.8s" }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 12, color: trendColor, marginTop: 3 }}>{Math.round(Number(data.trendStrength) || 0)}%</div>
                    </div>
                    <div style={{ ...glassCard, borderRadius: 16, padding: 18 }}>
                      <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 12 }}>RISK ASSESSMENT</div>
                      <RiskMeter score={data.riskScore} />
                      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.text2 }}>
                        <span>Low</span><span>Medium</span><span>High</span>
                      </div>
                    </div>
                    <div style={{ ...glassCard, borderRadius: 16, padding: 18 }}>
                      <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 12 }}>MODEL CONFIDENCE</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8 }}>
                        <ConfidenceRing value={data.confidence} />
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#00e5a0", fontFamily: "'Space Mono', monospace" }}>{Math.round(Number(data.confidence) || 0)}%</div>
                          <div style={{ fontSize: 11, color: theme.text2, marginTop: 4 }}>Prediction confidence</div>
                          <div style={{ fontSize: 11, color: data.confidence > 75 ? "#4ade80" : data.confidence > 55 ? "#facc15" : "#f87171", marginTop: 2 }}>
                            {data.confidence > 75 ? "● High confidence" : data.confidence > 55 ? "● Moderate" : "● Low confidence"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Technical Indicators */}
                  <div style={{ ...glassCard, borderRadius: 16, padding: 20 }}>
                    <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 16 }}>TECHNICAL INDICATORS</div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: 12 }}>
                      {[
                        { label: "RSI (14)", value: data.indicators.rsi, note: data.indicators.rsi > 70 ? "Overbought" : data.indicators.rsi < 30 ? "Oversold" : "Neutral", color: data.indicators.rsi > 70 ? "#f87171" : data.indicators.rsi < 30 ? "#4ade80" : "#facc15" },
                        { label: "MACD", value: data.indicators.macd, note: data.indicators.macd > 0 ? "Bullish" : "Bearish", color: data.indicators.macd > 0 ? "#4ade80" : "#f87171" },
                        { label: "EMA 20", value: formatINR(data.indicators.ema20), note: data.lastPrice > data.indicators.ema20 ? "Above" : "Below", color: data.lastPrice > data.indicators.ema20 ? "#4ade80" : "#f87171" },
                        { label: "EMA 50", value: formatINR(data.indicators.ema50), note: data.lastPrice > data.indicators.ema50 ? "Above" : "Below", color: data.lastPrice > data.indicators.ema50 ? "#4ade80" : "#f87171" },
                        { label: "Volume", value: data.indicators.volume, note: "Avg Daily", color: "#778899" },
                      ].map(ind => (
                        <div key={ind.label} style={{ background: themeMode === "light" ? "rgba(255,255,255,0.45)" : theme.input, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 1, marginBottom: 6 }}>{ind.label}</div>
                          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{ind.value}</div>
                          <div style={{ fontSize: 10, color: ind.color, fontWeight: 600 }}>{ind.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function StockDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setCurrentUser(null);
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Auth check failed");
        return res.json();
      })
      .then((user) => {
        setCurrentUser(user);
      })
      .catch((err) => {
        console.error(err);
        localStorage.removeItem("token");
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background: #060e17;
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #07101a; }
        ::-webkit-scrollbar-thumb { background: #1a2a3a; border-radius: 2px; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {authLoading ? (
        <div style={{
          minHeight: "100vh", background: "#060e17", color: "#cde",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif", gap: 16
        }}>
          <div style={{
            width: 44,
            height: 44,
            border: "3px solid rgba(0, 229, 160, 0.15)",
            borderTop: "3px solid #00e5a0",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }} />
          <div style={{ fontSize: 14, letterSpacing: 0.5, fontWeight: 500 }}>
            Loading Algooee...
          </div>
        </div>
      ) : !currentUser ? (
        <LoginView API_BASE={API_BASE} onLoginSuccess={(token, user) => {
          localStorage.setItem("token", token);
          setCurrentUser(user);
        }} />
      ) : (
        <DashboardContent currentUser={currentUser} onLogout={handleLogout} />
      )}
    </>
  );
}
