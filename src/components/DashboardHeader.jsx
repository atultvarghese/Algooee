import React from "react";
import { formatINR } from "../utils/formatters";

export default function DashboardHeader({
  currentUser,
  onLogout,
  themeMode,
  setThemeMode,
  activePage,
  setActivePage,
  isMobile,
  showWatchlist,
  setShowWatchlist,
  setShowTour,
  cashBalance,
  theme
}) {
  return (
    <div style={{
      gridColumn: "1/-1",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "space-between",
      padding: isMobile ? "12px 14px" : "0 28px",
      borderBottom: `1px solid ${theme.border}`,
      background: theme.card,
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
            <div id="walkthrough-nav-tabs" style={{ display: "flex", gap: 6 }}>
              <button
                id="walkthrough-nav-stock"
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
                id="walkthrough-nav-options"
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
                id="walkthrough-nav-admin"
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
                  {formatINR(cashBalance)}
                </span>
              </div>
              <button
                id="walkthrough-tour-restart"
                onClick={() => setShowTour(true)}
                style={{
                  background: themeMode === "light" ? "rgba(16, 185, 129, 0.1)" : "rgba(0, 229, 160, 0.1)",
                  color: themeMode === "light" ? "#10b981" : "#00e5a0",
                  border: `1px solid ${themeMode === "light" ? "rgba(16, 185, 129, 0.3)" : "rgba(0, 229, 160, 0.3)"}`,
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
              >
                <span>🚀</span> TOUR
              </button>
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
                id="walkthrough-tour-restart"
                onClick={() => setShowTour(true)}
                style={{
                  background: themeMode === "light" ? "rgba(16, 185, 129, 0.1)" : "rgba(0, 229, 160, 0.1)",
                  color: themeMode === "light" ? "#10b981" : "#00e5a0",
                  border: `1px solid ${themeMode === "light" ? "rgba(16, 185, 129, 0.3)" : "rgba(0, 229, 160, 0.3)"}`,
                  borderRadius: 6, padding: "6px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer"
                }}
                title="Take Onboarding Tour"
              >
                🚀
              </button>
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
          <div id="walkthrough-nav-tabs" style={{
            display: "flex",
            background: themeMode === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: 2
          }}>
            {[
              { id: "stock", label: "Stock", tourId: "walkthrough-nav-stock" },
              { id: "options", label: "Options", tourId: "walkthrough-nav-options" },
              { id: "admin", label: "Admin", tourId: "walkthrough-nav-admin" },
              ...(currentUser?.role === "admin" ? [{ id: "users", label: "Users", tourId: "walkthrough-nav-users" }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                id={tab.tourId}
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
                {formatINR(cashBalance)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
