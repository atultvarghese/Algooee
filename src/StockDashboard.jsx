import { useState, useEffect } from "react";
import { themes } from "./theme";

// Hooks & Utils
import useStocks from "./hooks/useStocks";
import usePaperTrade from "./hooks/usePapertrade";
import { formatINR } from "./utils/formatters";
import { API_BASE } from "./utils/constants";

// Components
import OptionsChainView from "./components/OptionsChainView";
import LoginView from "./components/LoginView";
import UserManagementView from "./components/UserManagementView";
import WalkthroughTour from "./components/WalkthroughTour";

// Custom Modular Components
import DashboardHeader from "./components/DashboardHeader";
import WatchlistSidebar from "./components/WatchlistSidebar";
import AdminView from "./components/AdminView";
import StockView from "./components/StockView";

function DashboardContent({ currentUser, onLogout, themeMode, setThemeMode }) {
  const [activePage, setActivePage] = useState("stock");
  const [optionUnderlying, setOptionUnderlying] = useState("NIFTY");
  const [selectedOptionContract, setSelectedOptionContract] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(window.innerWidth <= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const userOnboardingKey = `algoooeee_tour_completed_${currentUser?.id || currentUser?.email || 'guest'}`;
  const [showTour, setShowTour] = useState(!localStorage.getItem(userOnboardingKey));

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
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

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

  useEffect(() => {
    const queryStr = (stockSearch || "").trim();
    if (!queryStr) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearchLoading(true);
      const token = localStorage.getItem("token");
      fetch(`${API_BASE}/api/instruments/search?q=${encodeURIComponent(queryStr)}`, {
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
        })
        .catch((err) => {
          console.error("Live search error:", err);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [stockSearch]);

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

  const chartActualHistory = data?.history ? data.history.slice(-10) : [];
  const chartBacktest = data?.backtest ? data.backtest.slice(-10) : [];
  const chartFuture = data?.predicted ? data.predicted.slice(0, 1) : [];
  const forecastRows = data?.predicted ? data.predicted.slice(0, 1) : [];
  const summary = data?.backtestSummary || {};
  const avgBacktestAbsError = Number.isFinite(summary.mae) ? summary.mae : (data?.backtest?.length || 0) > 0
    ? data.backtest.reduce((sum, row) => sum + Math.abs((row.actual ?? 0) - (row.predicted ?? 0)), 0) / data.backtest.length
    : NaN;
  const backtestRows = data?.backtest ? data.backtest.slice(-8).reverse() : [];

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
      <DashboardHeader
        currentUser={currentUser}
        onLogout={onLogout}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        activePage={activePage}
        setActivePage={setActivePage}
        isMobile={isMobile}
        showWatchlist={showWatchlist}
        setShowWatchlist={setShowWatchlist}
        setShowTour={setShowTour}
        cashBalance={paper.cash_balance}
        theme={theme}
      />

      {/* Sidebar */}
      {((!isMobile && activePage !== "users") || (isMobile && activePage === "stock" && showWatchlist)) && (
        <WatchlistSidebar
          themeMode={themeMode}
          theme={theme}
          isMobile={isMobile}
          activePage={activePage}
          setActivePage={setActivePage}
          showWatchlist={showWatchlist}
          setShowWatchlist={setShowWatchlist}
          stockSearch={stockSearch}
          setStockSearch={setStockSearch}
          searchResults={searchResults}
          searchLoading={searchLoading}
          stockError={stockError}
          stockNotice={stockNotice}
          selected={selected}
          setSelected={setSelected}
          setOptionUnderlying={setOptionUnderlying}
          stocks={stocks}
          remoteStocks={remoteStocks}
          removeWatchlistStock={removeWatchlistStock}
          addWatchlistStock={addWatchlistStock}
          stockData={stockData}
        />
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
            <div id="walkthrough-options-grid">
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
            </div>
          ) : activePage === "admin" ? (
            <AdminView
              paperLoading={paperLoading}
              paper={paper}
              paperError={paperError}
              paperNotice={paperNotice}
              paperBusy={paperBusy}
              themeMode={themeMode}
              theme={theme}
              glassCard={glassCard}
              isMobile={isMobile}
              adminMobileTab={adminMobileTab}
              setAdminMobileTab={setAdminMobileTab}
              fundAmount={fundAmount}
              setFundAmount={setFundAmount}
              handleAddFunds={handleAddFunds}
              resetPaperAccount={resetPaperAccount}
              placePaperOrder={placePaperOrder}
              setSelected={setSelected}
              setActivePage={setActivePage}
              setShowWatchlist={setShowWatchlist}
              setOptionUnderlying={setOptionUnderlying}
              setSelectedOptionContract={setSelectedOptionContract}
            />
          ) : activePage === "stock" ? (
            <StockView
              loading={loading}
              data={data}
              selected={selected}
              remoteStocks={remoteStocks}
              stocks={stocks}
              todayPrice={todayPrice}
              predictedVal={predictedVal}
              paper={paper}
              tradeAmount={tradeAmount}
              setTradeAmount={setTradeAmount}
              tradePrice={tradePrice}
              setTradePrice={setTradePrice}
              handlePlaceOrder={handlePlaceOrder}
              paperBusy={paperBusy}
              selectedPosition={selectedPosition}
              chartData={chartData}
              latestActualTs={latestActualTs}
              loadPrediction={loadPrediction}
              predictLoading={predictLoading}
              predictError={predictError}
              avgBacktestAbsError={avgBacktestAbsError}
              summary={summary}
              backtestRows={backtestRows}
              forecastRows={forecastRows}
              trendColor={trendColor}
              themeMode={themeMode}
              theme={theme}
              glassCard={glassCard}
              isMobile={isMobile}
            />
          ) : null}
        </div>
      )}
      {showTour && (
        <WalkthroughTour
          themeMode={themeMode}
          activePage={activePage}
          setActivePage={setActivePage}
          isMobile={isMobile}
          showWatchlist={showWatchlist}
          setShowWatchlist={setShowWatchlist}
          adminMobileTab={adminMobileTab}
          setAdminMobileTab={setAdminMobileTab}
          onClose={(completed) => {
            if (completed) {
              localStorage.setItem(userOnboardingKey, "true");
            }
            setShowTour(false);
          }}
        />
      )}
    </div>
  );
}

export default function StockDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [themeMode, setThemeMode] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    localStorage.setItem("theme", themeMode);
    document.body.style.background = themeMode === "dark" ? "#060e17" : "linear-gradient(135deg, #eef4ff 0%, #f7f9fc 50%, #eef8ff 100%)";
  }, [themeMode]);

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
          background: ${themeMode === "dark" ? "#060e17" : "linear-gradient(135deg, #eef4ff 0%, #f7f9fc 50%, #eef8ff 100%)"};
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${themeMode === "dark" ? "#07101a" : "rgba(0, 0, 0, 0.05)"}; }
        ::-webkit-scrollbar-thumb { background: ${themeMode === "dark" ? "#1a2a3a" : "rgba(0, 0, 0, 0.15)"}; border-radius: 2px; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {authLoading ? (
        <div style={{
          minHeight: "100vh", background: themeMode === "dark" ? "#060e17" : "linear-gradient(135deg, #eef4ff 0%, #f7f9fc 50%, #eef8ff 100%)", color: themeMode === "dark" ? "#cde" : "#111827",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif", gap: 16
        }}>
          <div style={{
            width: 44,
            height: 44,
            border: themeMode === "dark" ? "3px solid rgba(0, 229, 160, 0.15)" : "3px solid rgba(16, 185, 129, 0.15)",
            borderTop: themeMode === "dark" ? "3px solid #00e5a0" : "3px solid #10b981",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }} />
          <div style={{ fontSize: 14, letterSpacing: 0.5, fontWeight: 500 }}>
            Loading Algooee...
          </div>
        </div>
      ) : !currentUser ? (
        <LoginView 
          API_BASE={API_BASE} 
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          onLoginSuccess={(token, user) => {
            localStorage.setItem("token", token);
            setCurrentUser(user);
          }} 
        />
      ) : (
        <DashboardContent 
          currentUser={currentUser} 
          onLogout={handleLogout} 
          themeMode={themeMode}
          setThemeMode={setThemeMode}
        />
      )}
    </>
  );
}
