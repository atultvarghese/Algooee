import React from "react";
import { formatINR, formatExactDateTime, formatPreciseRelativeTime, getDaysRemaining } from "../utils/formatters";

const roundQty = (q) => {
  const n = Number(q);
  return Number.isFinite(n) ? +n.toFixed(4) : "0";
};

export default function AdminView({
  paperLoading,
  paper,
  paperError,
  paperNotice,
  paperBusy,
  themeMode,
  theme,
  isMobile,
  adminMobileTab,
  setAdminMobileTab,
  fundAmount,
  setFundAmount,
  handleAddFunds,
  resetPaperAccount,
  placePaperOrder,
  setSelected,
  setActivePage,
  setShowWatchlist,
  setOptionUnderlying,
  setSelectedOptionContract
}) {
  if (paperLoading && !paper) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", minHeight: "250px", gap: 16 }}>
        <div className="spinner" style={{
          width: 40,
          height: 40,
          border: "3px solid rgba(0, 229, 160, 0.15)",
          borderTop: "3px solid #00e5a0"
        }} />
        <div style={{ color: "var(--theme-text2)", fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>
          Loading paper trading account...
        </div>
      </div>
    );
  }

  const paperPortfolio = paper || {
    cash_balance: 0, total_funded: 0, invested_cost: 0, market_value: 0, equity: 0,
    realized_pnl: 0, unrealized_pnl: 0, total_pnl: 0, pnl_vs_funded: 0, day_pnl: 0,
    positions: [], trades: [], cash_flows: [],
  };

  const handleBuyAction = (pos) => {
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
  };

  const handleSellAction = (pos) => {
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
  };

  return (
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
            border: "1px solid var(--theme-border)",
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
                className={`mobile-tab-btn ${adminMobileTab === tab.id ? "active" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Contents */}
          {adminMobileTab === "holdings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Account Summary Card */}
              <div id="walkthrough-admin-metrics" className="glass-card" style={{
                borderRadius: 16,
                padding: "20px",
                background: themeMode === "light" ? "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)" : "linear-gradient(135deg, #0e1e2f 0%, #060e17 100%)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
              }}>
                <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                  Account Net Worth
                </div>
                <div className="mono-font" style={{ fontSize: 24, fontWeight: 700, color: "var(--theme-text)", marginBottom: 16 }}>
                  {formatINR(paperPortfolio.cash_balance + paperPortfolio.market_value)}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 12px", borderTop: "1px solid var(--theme-border)", paddingTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--theme-text2)", textTransform: "uppercase", marginBottom: 2 }}>Cash Balance</div>
                    <div className="mono-font" style={{ fontSize: 13, fontWeight: 700, color: "#00e5a0" }}>
                      {formatINR(paperPortfolio.cash_balance)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--theme-text2)", textTransform: "uppercase", marginBottom: 2 }}>Total Invested</div>
                    <div className="mono-font" style={{ fontSize: 13, fontWeight: 700, color: "#9fe7ff" }}>
                      {formatINR(paperPortfolio.invested_cost)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--theme-text2)", textTransform: "uppercase", marginBottom: 2 }}>Market Value</div>
                    <div className="mono-font" style={{ fontSize: 13, fontWeight: 700, color: "#4a9eff" }}>
                      {formatINR(paperPortfolio.market_value)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--theme-text2)", textTransform: "uppercase", marginBottom: 2 }}>Total P&L</div>
                    <div style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: (paperPortfolio.total_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444"
                    }}>
                      {(paperPortfolio.total_pnl ?? 0) >= 0 ? "▲" : "▼"} {formatINR(Math.abs(paperPortfolio.total_pnl))}
                      <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 500 }}>
                        ({paperPortfolio.invested_cost > 0 ? (((paperPortfolio.total_pnl ?? 0) / paperPortfolio.invested_cost) * 100).toFixed(2) : "0.00"}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Open Positions list */}
              <div id="walkthrough-admin-holdings">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--theme-text2)", letterSpacing: 1, fontWeight: 700 }}>PORTFOLIO HOLDINGS</div>
                  <div style={{ fontSize: 10, color: "var(--theme-text3)" }}>{(paperPortfolio.positions || []).length} active positions</div>
                </div>

                {(paperPortfolio.positions || []).length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {(paperPortfolio.positions || []).map((pos) => {
                      const isProfit = (pos.unrealized_pnl ?? 0) >= 0;
                      const isDayProfit = (pos.day_pnl ?? 0) >= 0;
                      const pnlPct = pos.cost_value > 0 ? ((pos.unrealized_pnl ?? 0) / pos.cost_value) * 100 : 0;
                      const dayPnlPct = pos.prev_close > 0 ? ((pos.current_price - pos.prev_close) / pos.prev_close) * 100 : 0;

                      return (
                        <div key={pos.id || pos.isin} className="holdings-card">
                          {/* Header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--theme-text)" }}>{pos.name}</span>
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
                              <div style={{ fontSize: 9, color: "var(--theme-text3)", marginTop: 4 }}>{pos.isin}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div className="mono-font" style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: isProfit ? "#00e5a0" : "#ef4444"
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
                            borderTop: "1px solid var(--theme-border)",
                            borderBottom: "1px solid var(--theme-border)",
                            padding: "10px 0"
                          }}>
                            <div>
                              <div style={{ fontSize: 9, color: "var(--theme-text2)", marginBottom: 2 }}>Qty</div>
                              <div className="mono-font" style={{ fontSize: 11, fontWeight: 700, color: "var(--theme-text)" }}>{pos.quantity}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "var(--theme-text2)", marginBottom: 2 }}>Avg Cost</div>
                              <div className="mono-font" style={{ fontSize: 11, fontWeight: 700, color: "var(--theme-text)" }}>{formatINR(pos.avg_price)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "var(--theme-text2)", marginBottom: 2 }}>LTP</div>
                              <div className="mono-font" style={{ fontSize: 11, fontWeight: 700, color: "var(--theme-text)" }}>{formatINR(pos.current_price)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "var(--theme-text2)", marginBottom: 2 }}>Amt Invested</div>
                              <div className="mono-font" style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text2)" }}>{formatINR(pos.cost_value)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "var(--theme-text2)", marginBottom: 2 }}>Market Value</div>
                              <div className="mono-font" style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text)" }}>{formatINR(pos.market_value)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "var(--theme-text2)", marginBottom: 2 }}>Day Return</div>
                              <div className="mono-font" style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: isDayProfit ? "#00e5a0" : "#ef4444"
                              }}>
                                {isDayProfit ? "+" : ""}{dayPnlPct.toFixed(2)}%
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 8, color: "var(--theme-text3)", lineHeight: "1.3" }}>
                              <div>Updated: {formatExactDateTime(pos.updated_at)}</div>
                              <div style={{ color: "#00e5a0", marginTop: 2 }}>{formatPreciseRelativeTime(pos.updated_at)}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => handleBuyAction(pos)}
                                disabled={paperBusy}
                                className="btn-buy"
                                style={{ padding: "6px 12px", fontSize: 10 }}
                              >
                                BUY
                              </button>
                              <button
                                onClick={() => handleSellAction(pos)}
                                disabled={paperBusy}
                                className="btn-sell"
                                style={{ padding: "6px 12px", fontSize: 10 }}
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
                    border: "1px dashed var(--theme-border)", borderRadius: 12,
                    color: "var(--theme-text2)", fontSize: 12
                  }}>
                    No open holdings in your paper portfolio yet. Go to Stock Page to Buy stocks.
                  </div>
                )}
              </div>
            </div>
          )}

          {adminMobileTab === "trades" && (
            <div className="glass-card" style={{
              borderRadius: 16,
              padding: "20px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>RECENT TRANSACTION LOG</div>
                <span style={{ fontSize: 9, color: "var(--theme-text3)" }}>Last 15 trades</span>
              </div>

              {(paperPortfolio.trades || []).length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(paperPortfolio.trades || []).slice(0, 15).map((trade) => (
                    <div key={trade.id} style={{
                      background: themeMode === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.01)",
                      border: "1px solid var(--theme-border)",
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
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--theme-text)" }}>
                            {trade.name || trade.isin}
                          </span>
                        </div>
                        <div className="mono-font" style={{ fontSize: 12, fontWeight: 700, color: "var(--theme-text)" }}>
                          {formatINR(trade.gross_value)}
                        </div>
                      </div>

                      {trade.is_option && trade.expiry && (
                        <div style={{ fontSize: 9, color: "#ffb077", fontWeight: 600 }}>
                          Expiry: {trade.expiry} ({getDaysRemaining(trade.expiry)})
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--theme-text2)", borderTop: "1px solid var(--theme-border)", paddingTop: 6 }}>
                        <div>Qty: {roundQty(trade.quantity)} @ {formatINR(trade.price)}</div>
                        <div style={{ fontSize: 8, color: "var(--theme-text3)" }}>
                          {formatExactDateTime(trade.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--theme-text2)", fontSize: 11 }}>
                  No trades logged yet.
                </div>
              )}
            </div>
          )}

          {adminMobileTab === "controls" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Admin Funding / Reset Control */}
              <div id="walkthrough-admin-controls" className="glass-card" style={{
                borderRadius: 16,
                padding: "20px"
              }}>
                <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700, marginBottom: 14 }}>ADMIN CONTROLS</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, color: "var(--theme-text2)", marginBottom: 6, fontWeight: 600 }}>ADD VIRTUAL FUNDS (DUMMY)</label>
                    <input
                      type="number" min="0" max="10000000" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
                      placeholder="Amount in INR (e.g. 50000)"
                      className="theme-input"
                    />
                  </div>

                  <button
                    onClick={handleAddFunds} disabled={paperBusy}
                    className="btn-action"
                  >
                    {paperBusy ? "PROCESSING..." : "DEPOSIT FUNDS"}
                  </button>

                  <div style={{ borderTop: "1px solid var(--theme-border)", margin: "8px 0" }} />

                  <button
                    onClick={resetPaperAccount} disabled={paperBusy}
                    className="btn-reset"
                  >
                    RESET ACCOUNT (0 CASH)
                  </button>
                </div>

                <div style={{ marginTop: 16, fontSize: 10, color: "var(--theme-text2)", lineHeight: "1.4", borderTop: "1px solid var(--theme-border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Total funded so far:</span>
                    <span className="mono-font" style={{ color: "var(--theme-text)", fontWeight: 600 }}>{formatINR(paperPortfolio.total_funded)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>P/L vs funded:</span>
                    <span className="mono-font" style={{ color: (paperPortfolio.pnl_vs_funded ?? 0) >= 0 ? "#00e5a0" : "#ef4444", fontWeight: 600 }}>
                      {formatINR(paperPortfolio.pnl_vs_funded)}
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
            <div id="walkthrough-admin-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Cash Balance", value: formatINR(paperPortfolio.cash_balance), color: "#00e5a0", desc: "Available for trading" },
                { label: "Total Invested", value: formatINR(paperPortfolio.invested_cost), color: "#9fe7ff", desc: "Capital in holdings" },
                { label: "Market Value", value: formatINR(paperPortfolio.market_value), color: "#4a9eff", desc: "Current holdings value" },
                { label: "Total Profit / Loss", value: formatINR(paperPortfolio.total_pnl), color: (paperPortfolio.total_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444", desc: "Unrealized P/L of open positions" },
              ].map((item) => (
                <div key={item.label} className="glass-card" style={{
                  borderRadius: 16,
                  padding: "16px"
                }}>
                  <div style={{ fontSize: 10, color: "#556a84", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
                  <div className="mono-font" style={{ fontSize: 15, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: "#3a4e68" }}>{item.desc}</div>
                </div>
              ))}
            </div>

            {/* Open Positions Card */}
            <div id="walkthrough-admin-holdings" className="glass-card" style={{
              borderRadius: 16,
              padding: "20px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>PORTFOLIO HOLDINGS</div>
                <div style={{ fontSize: 10, color: "#556a84" }}>{(paperPortfolio.positions || []).length} active assets</div>
              </div>

              {(paperPortfolio.positions || []).length ? (
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
                    {(paperPortfolio.positions || []).map((pos) => (
                      <div key={pos.id || pos.isin} style={{
                        display: "grid",
                        gridTemplateColumns: "1.3fr 1.1fr 1.0fr 0.9fr 1.0fr 1.2fr 0.9fr",
                        borderTop: "1px solid #142234", fontSize: 12,
                        background: "var(--theme-card)", color: "#cde",
                        alignItems: "center"
                      }}>
                        <div style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--theme-text)" }}>{pos.name}</div>
                          <div style={{ fontSize: 9, color: "#556a84", marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                            {pos.is_option && pos.expiry ? (
                              <>
                                <span style={{ color: "var(--theme-text2)" }}>Expiry: <span style={{ color: "#cde" }}>{pos.expiry}</span></span>
                                <span style={{ color: "#ffb077", fontWeight: 500 }}>({getDaysRemaining(pos.expiry)})</span>
                              </>
                            ) : (
                              pos.isin
                            )}
                          </div>
                        </div>
                        <div className="mono-font" style={{ padding: "12px 14px", color: "#9bb0c4" }}>
                          {formatINR(pos.cost_value)}
                        </div>
                        <div className="mono-font" style={{ padding: "12px 14px", color: "#9bb0c4" }}>
                          {formatINR(pos.avg_price)}
                        </div>
                        <div className="mono-font" style={{ padding: "12px 14px", color: "var(--theme-text)" }}>
                          {formatINR(pos.current_price)}
                        </div>
                        <div className="mono-font" style={{
                          padding: "12px 14px",
                          color: (pos.unrealized_pnl ?? 0) >= 0 ? "#00e5a0" : "#ef4444",
                          fontWeight: 600
                        }}>
                          {formatINR(pos.unrealized_pnl)}
                        </div>
                        <div style={{ padding: "12px 14px", color: "#9bb0c4" }}>
                          <div className="mono-font" style={{ color: "var(--theme-text)" }}>{formatExactDateTime(pos.updated_at)}</div>
                          <div style={{ fontSize: 10, color: "#00e5a0", marginTop: 2 }}>{formatPreciseRelativeTime(pos.updated_at)}</div>
                        </div>
                        <div style={{ padding: "8px 6px", display: "flex", gap: "4px", justifyContent: "center" }}>
                          <button
                            onClick={() => handleBuyAction(pos)}
                            disabled={paperBusy}
                            className="btn-buy"
                            style={{ padding: "6px 8px", fontSize: 10 }}
                          >
                            BUY
                          </button>
                          <button
                            onClick={() => handleSellAction(pos)}
                            disabled={paperBusy}
                            className="btn-sell"
                            style={{ padding: "6px 8px", fontSize: 10 }}
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
            <div id="walkthrough-admin-controls" className="glass-card" style={{
              borderRadius: 16,
              padding: "20px"
            }}>
              <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700, marginBottom: 14 }}>ADMIN CONTROLS</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600 }}>ADD FUNDS (INR)</label>
                  <input
                    type="number" min="0" max="10000000" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="Amount in INR (e.g. 50000)"
                    className="theme-input"
                  />
                </div>

                <button
                  onClick={handleAddFunds} disabled={paperBusy}
                  className="btn-action"
                >
                  {paperBusy ? "PROCESSING..." : "DEPOSIT FUNDS"}
                </button>

                <div style={{ borderTop: "1px solid #142234", margin: "8px 0" }} />

                <button
                  onClick={resetPaperAccount} disabled={paperBusy}
                  className="btn-reset"
                >
                  RESET ACCOUNT (0 CASH)
                </button>
              </div>

              <div style={{ marginTop: 14, fontSize: 10, color: "#556a84", lineHeight: "1.4" }}>
                Total funded so far: <span className="mono-font" style={{ color: "var(--theme-text)" }}>{formatINR(paperPortfolio.total_funded)}</span><br />
                P/L vs funded: <span className="mono-font" style={{ color: (paperPortfolio.pnl_vs_funded ?? 0) >= 0 ? "#00e5a0" : "#ef4444", fontWeight: 600 }}>{formatINR(paperPortfolio.pnl_vs_funded)}</span>
              </div>
            </div>

            {/* Unified Activity Log (Cleaned up trades / ledger) */}
            <div className="glass-card" style={{
              borderRadius: 16,
              padding: "20px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#9bb0c4", letterSpacing: 1, fontWeight: 700 }}>RECENT TRANSACTION LOG</div>
                <span style={{ fontSize: 9, color: "#556a84" }}>Last 8 trades</span>
              </div>

              {(paperPortfolio.trades || []).length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(paperPortfolio.trades || []).slice(0, 8).map((trade) => (
                    <div key={trade.id} style={{
                      borderBottom: "1px solid #0e1a29", paddingBottom: 8,
                      display: "grid", gridTemplateColumns: "1fr auto", gap: "4px"
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text)" }}>
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
                              <span style={{ color: "var(--theme-text2)" }}>Expiry: <span style={{ color: "#cde" }}>{trade.expiry}</span></span>
                              <span style={{ color: "#ffb077", marginLeft: 4 }}>({getDaysRemaining(trade.expiry)})</span>
                            </div>
                          ) : null}
                          {formatExactDateTime(trade.created_at)} ({formatPreciseRelativeTime(trade.created_at)})
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono-font" style={{ fontSize: 11, fontWeight: 600, color: "#cde" }}>
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
  );
}
