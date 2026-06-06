import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatINR, formatPercent, formatDateLabel } from "../utils/formatters";
import { RiskMeter, ConfidenceRing, CustomTooltip } from "./CommonWidgets";

export default function StockView({
  loading,
  data,
  selected,
  remoteStocks,
  stocks,
  todayPrice,
  predictedVal,
  paper,
  tradeAmount,
  setTradeAmount,
  tradePrice,
  setTradePrice,
  handlePlaceOrder,
  paperBusy,
  selectedPosition,
  chartData,
  latestActualTs,
  loadPrediction,
  predictLoading,
  predictError,
  avgBacktestAbsError,
  summary,
  backtestRows,
  forecastRows,
  trendColor,
  themeMode,
  theme,
  glassCard,
  isMobile
}) {
  if (loading && !data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", minHeight: "250px", gap: 16 }}>
        <div className="spinner" style={{
          width: 40,
          height: 40,
          border: "3px solid rgba(0, 229, 160, 0.15)",
          borderTop: "3px solid #00e5a0"
        }} />
        <div style={{ color: "var(--theme-text2)", fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>
          Loading stock intelligence...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const displayName = ((remoteStocks || stocks || []).find(s => s.ticker === selected) || {}).name || data.name || selected;

  return (
    <>
      {data.error && (
        <div style={{
          marginBottom: 16,
          borderRadius: 10,
          padding: "12px 16px",
          border: "1px solid #f8717133",
          background: "#1e0b0e",
          color: "#fca5a5",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
          <div>
            <strong>Market Data Unavailable:</strong> {data.error.includes("Upstox API client not configured") ? "Upstox API client is not configured. Please set UPSTOX_API_TOKEN in your .env file to enable live market quotes." : data.error}
          </div>
        </div>
      )}

      {/* Stock header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: isMobile ? 12 : 0, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 className="mono-font" style={{ fontSize: 28, margin: 0, color: "var(--theme-text)" }}>{displayName}</h1>
            <span style={{ fontSize: 14, color: "#667788" }}>{selected}</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
            <div>
              <div className="mono-font" style={{ fontSize: 22, color: "var(--theme-text)", fontWeight: 700 }}>{formatINR(todayPrice ?? data.lastPrice)}</div>
              <div style={{ fontSize: 12, color: "var(--theme-text2)", marginTop: 4 }}>
                Today: {formatINR(todayPrice)}{data.hasPrediction ? ` · Predicted: ${formatINR(predictedVal)}` : ""}
              </div>
            </div>
            {data.changePct !== null && data.changePct !== undefined ? (
              <span style={{ color: data.changePct >= 0 ? "#4ade80" : "#f87171", fontSize: 14, fontWeight: 600 }}>
                {data.changePct >= 0 ? "▲" : "▼"} {Math.abs(data.change ?? 0)} ({Math.abs(data.changePct)}%)
              </span>
            ) : (
              <span style={{ color: "var(--theme-text3)", fontSize: 14 }}>—</span>
            )}
            <span style={{ fontSize: 11, color: "var(--theme-text2)" }}>15D</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {data.hasPrediction && <ConfidenceRing value={data.confidence} />}
        </div>
      </div>

      {/* Paper Trade */}
      <div id="walkthrough-papertrade" className="glass-card" style={{ borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#667788", letterSpacing: 1 }}>PAPER TRADE · QUANTITY BASED</div>
          <div style={{ fontSize: 12, color: "#00e5a0", fontWeight: 700 }}>Cash: {formatINR(paper.cash_balance)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10, marginBottom: 10 }}>
          <input
            type="number" min="1" step="1" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)}
            placeholder="Quantity (shares)"
            className="theme-input"
            style={{ width: isMobile ? "100%" : 220 }}
          />
          <input
            type="number" min="0" step="0.01" value={tradePrice} onChange={(e) => setTradePrice(e.target.value)}
            placeholder="Execution price"
            className="theme-input"
            style={{ width: isMobile ? "100%" : 170 }}
          />
          <button
            onClick={() => {
              const live = Number(todayPrice ?? data.lastPrice);
              if (Number.isFinite(live) && live > 0) setTradePrice(live.toFixed(2));
            }}
            className="theme-toggle-btn"
            style={{ padding: "9px 12px" }}
          >
            Use Today
          </button>
          <button
            onClick={() => handlePlaceOrder("buy")} disabled={paperBusy || !(Number(tradePrice || todayPrice || data.lastPrice) > 0)}
            className="btn-buy"
          >
            BUY
          </button>
          <button
            onClick={() => handlePlaceOrder("sell")} disabled={paperBusy || !(Number(tradePrice || todayPrice || data.lastPrice) > 0)}
            className="btn-sell"
          >
            SELL
          </button>
        </div>
        {tradeAmount && (
          <div style={{ fontSize: 11, color: "var(--theme-text2)" }}>
            Est. Cost: <span style={{ color: "#00e5a0", fontWeight: 600 }}>{formatINR(Number(tradeAmount) * Number(tradePrice || todayPrice || data.lastPrice || 0))}</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#667788", marginBottom: 8 }}>
          Default execution price is today price: <span style={{ color: "#9fe7ff" }}>{formatINR(todayPrice ?? data.lastPrice)}</span>. You can edit this price before Buy/Sell.
        </div>
        <div style={{ fontSize: 11, color: "#667788" }}>
          Current holding: {selectedPosition ? `${selectedPosition.quantity} qty` : "0 qty"} · Position value: {formatINR(selectedPosition?.market_value ?? 0)} · Unrealized P/L: <span style={{ color: (selectedPosition?.unrealized_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(selectedPosition?.unrealized_pnl ?? 0)}</span> · Day P/L: <span style={{ color: (selectedPosition?.day_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{formatINR(selectedPosition?.day_pnl ?? 0)}</span>
        </div>
      </div>

      {/* Chart */}
      <div id="walkthrough-chart" className="glass-card" style={{ borderRadius: 16, padding: "20px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingRight: 8 }}>
          <span style={{ fontSize: 12, color: "#667788", letterSpacing: 1 }}>
            {data.hasPrediction ? "LAST 10 DAYS + NEXT 1 DAY · ACTUAL & PREDICTED" : "LAST 10 DAYS · HISTORICAL PRICE"}
          </span>
          <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
            <span style={{ color: "#4a9eff" }}>── Actual</span>
            {data.hasPrediction && <span style={{ color: "#00e5a0" }}>── Predicted</span>}
            {data.hasPrediction && <span style={{ color: "#7cc8ad" }}>·· Range</span>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1a2a3a" strokeDasharray="3 3" vertical={false} />
            <XAxis type="number" dataKey="ts" scale="time" domain={["dataMin", "dataMax"]} tick={{ fill: "#445566", fontSize: 10 }} tickFormatter={(v) => formatDateLabel(Number(v))} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={{ fill: "#445566", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v)} width={68} />
            <Tooltip content={<CustomTooltip />} />
            {data.hasPrediction && <ReferenceLine x={latestActualTs} stroke="#2a3a4a" strokeDasharray="4 4" label={{ value: "NOW", fill: "#445566", fontSize: 10 }} />}
            {data.hasPrediction && <Line type="linear" dataKey="upper" stroke="#7cc8ad" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={true} />}
            <Line type="linear" dataKey="actual" stroke="#4a9eff" strokeWidth={2} dot={chartData.length <= 120} connectNulls={false} />
            {data.hasPrediction && <Line type="linear" dataKey="predicted" stroke="#00e5a0" strokeWidth={2} dot={chartData.length <= 120} connectNulls={true} />}
            {data.hasPrediction && <Line type="linear" dataKey="lower" stroke="#7cc8ad" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls={true} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Generate Predictions Card */}
      {!data.hasPrediction && (
        <div className="prediction-prompt-card">
          <div style={{
            position: "absolute",
            top: -50,
            right: -50,
            width: 150,
            height: 150,
            background: "radial-gradient(circle, rgba(0, 229, 160, 0.1) 0%, transparent 70%)",
            borderRadius: "50%"
          }} />

          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--theme-text)", margin: "0 0 8px 0", letterSpacing: 0.5 }}>
            AI Price Predictions & Advanced Signals
          </h3>
          <p style={{ fontSize: 12, color: "var(--theme-text2)", maxWidth: 500, margin: "0 auto 20px auto", lineHeight: 1.6 }}>
            Generate high-precision forecasts, walk-forward backtests, risk profiles, and technical indicators (RSI, MACD, EMAs) powered by our machine learning models.
          </p>

          <button
            onClick={() => loadPrediction(selected)}
            disabled={predictLoading}
            className="btn-run-prediction"
          >
            {predictLoading ? "GENERATING FORECAST..." : "RUN AI MODEL PREDICTION"}
          </button>
          {predictError && (
            <div style={{ color: "#fca5a5", fontSize: 11, marginTop: 12 }}>
              Error generating predictions: {predictError}
            </div>
          )}
        </div>
      )}

      {data.hasPrediction && (
        <>
          {/* Prediction Details */}
          <div className="glass-card" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 2, marginBottom: 14 }}>PREDICTION DETAILS</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Next Day Range", value: `${formatINR(data.p10)} - ${formatINR(data.p90)}`, note: "p10 to p90" },
                { label: "Backtest MAE", value: formatINR(avgBacktestAbsError), note: `${summary.rows || backtestRows.length || 0} walk-forward rows` },
                { label: "Backtest MAPE", value: formatPercent(summary.mape ?? data.mape), note: "Mean absolute %" },
                { label: "Direction Hit", value: formatPercent(summary.directionalAccuracy ?? data.directionalAccuracy, 1), note: "High vs prior high" },
                { label: "Range Cover", value: formatPercent(summary.intervalCoverage ?? data.intervalCoverage, 1), note: "Actual inside range" },
                { label: "Model Edge", value: formatPercent(summary.modelEdgePct ?? data.modelEdgePct, 1), note: "vs simple baseline" },
              ].map((metric) => (
                <div key={metric.label} style={{ background: themeMode === "light" ? "rgba(255,255,255,0.45)" : "var(--theme-input)", border: "1px solid var(--theme-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 1, marginBottom: 6 }}>{metric.label}</div>
                  <div className="mono-font" style={{ fontSize: 14, fontWeight: 700, color: "var(--theme-text)", marginBottom: 4 }}>{metric.value}</div>
                  <div style={{ fontSize: 10, color: "#667788" }}>{metric.note}</div>
                </div>
              ))}
            </div>

            <div style={{ border: "1px solid var(--theme-border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, background: themeMode === "light" ? "linear-gradient(135deg,#1e40af,#2563eb)" : "#081321", color: themeMode === "light" ? "#ffffff" : "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)" }}>Date</div>
                <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)" }}>Predicted</div>
                <div style={{ padding: "10px 12px" }}>Range</div>
              </div>
              {forecastRows.length ? (
                forecastRows.map((row) => (
                  <div key={row.ts} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, borderTop: "1px solid var(--theme-border)", fontSize: 12 }}>
                    <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)", color: "#9bb0c4" }}>{row.dateLabel}</div>
                    <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)", color: "#00e5a0", fontWeight: 600 }}>{formatINR(row.price)}</div>
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
              <div style={{ border: "1px solid var(--theme-border)", borderRadius: 8, overflow: "hidden", minWidth: isMobile ? "500px" : "auto", marginTop: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 0, background: themeMode === "light" ? "linear-gradient(135deg,#1e40af,#2563eb)" : "#081321", color: themeMode === "light" ? "#ffffff" : "#667788", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)" }}>Backtest</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)" }}>Actual</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)" }}>Predicted</div>
                  <div style={{ padding: "10px 12px", borderRight: "1px solid var(--theme-border)" }}>Error</div>
                  <div style={{ padding: "10px 12px" }}>Hit</div>
                </div>
                {backtestRows.length ? (
                  backtestRows.map((row) => (
                    <div key={`bt-${row.ts}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 0, borderTop: "1px solid var(--theme-border)", fontSize: 12 }}>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid var(--theme-border)", color: "#9bb0c4" }}>{row.dateLabel}</div>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid var(--theme-border)", color: "#4a9eff" }}>{formatINR(row.actual)}</div>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid var(--theme-border)", color: "#00e5a0" }}>{formatINR(row.predicted)}</div>
                      <div style={{ padding: "9px 12px", borderRight: "1px solid var(--theme-border)", color: "#facc15" }}>
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
            <div className="glass-card" style={{ borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 2, marginBottom: 12 }}>TREND ANALYSIS</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span className="mono-font" style={{ fontSize: 22, color: trendColor, fontWeight: 700 }}>{data.trend}</span>
              </div>
              <div style={{ fontSize: 11, color: "#556677", marginBottom: 6 }}>Strength</div>
              <div style={{ height: 6, background: "#1e2d3d", borderRadius: 3 }}>
                <div style={{ width: `${Math.max(0, Math.min(100, Number(data.trendStrength) || 0))}%`, height: "100%", background: trendColor, borderRadius: 3, transition: "width 0.8s" }} />
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: trendColor, marginTop: 3 }}>{Math.round(Number(data.trendStrength) || 0)}%</div>
            </div>
            <div className="glass-card" style={{ borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 2, marginBottom: 12 }}>RISK ASSESSMENT</div>
              <RiskMeter score={data.riskScore} />
              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--theme-text2)" }}>
                <span>Low</span><span>Medium</span><span>High</span>
              </div>
            </div>
            <div className="glass-card" style={{ borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 2, marginBottom: 12 }}>MODEL CONFIDENCE</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8 }}>
                <ConfidenceRing value={data.confidence} />
                <div>
                  <div className="mono-font" style={{ fontSize: 22, fontWeight: 700, color: "#00e5a0" }}>{Math.round(Number(data.confidence) || 0)}%</div>
                  <div style={{ fontSize: 11, color: "var(--theme-text2)", marginTop: 4 }}>Prediction confidence</div>
                  <div style={{ fontSize: 11, color: data.confidence > 75 ? "#4ade80" : data.confidence > 55 ? "#facc15" : "#f87171", marginTop: 2 }}>
                    {data.confidence > 75 ? "● High confidence" : data.confidence > 55 ? "● Moderate" : "● Low confidence"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Indicators */}
          <div className="glass-card" style={{ borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 2, marginBottom: 16 }}>TECHNICAL INDICATORS</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: 12 }}>
              {[
                {
                  label: "RSI (14)",
                  value: data.indicators.rsi !== null && data.indicators.rsi !== undefined ? data.indicators.rsi : "—",
                  note: data.indicators.rsi !== null && data.indicators.rsi !== undefined ? (data.indicators.rsi > 70 ? "Overbought" : data.indicators.rsi < 30 ? "Oversold" : "Neutral") : "—",
                  color: data.indicators.rsi !== null && data.indicators.rsi !== undefined ? (data.indicators.rsi > 70 ? "#f87171" : data.indicators.rsi < 30 ? "#4ade80" : "#facc15") : "var(--theme-text3)"
                },
                {
                  label: "MACD",
                  value: data.indicators.macd !== null && data.indicators.macd !== undefined ? data.indicators.macd : "—",
                  note: data.indicators.macd !== null && data.indicators.macd !== undefined ? (data.indicators.macd > 0 ? "Bullish" : "Bearish") : "—",
                  color: data.indicators.macd !== null && data.indicators.macd !== undefined ? (data.indicators.macd > 0 ? "#4ade80" : "#f87171") : "var(--theme-text3)"
                },
                {
                  label: "EMA 20",
                  value: data.indicators.ema20 !== null && data.indicators.ema20 !== undefined ? formatINR(data.indicators.ema20) : "—",
                  note: data.indicators.ema20 !== null && data.indicators.ema20 !== undefined ? (data.lastPrice > data.indicators.ema20 ? "Above" : "Below") : "—",
                  color: data.indicators.ema20 !== null && data.indicators.ema20 !== undefined ? (data.lastPrice > data.indicators.ema20 ? "#4ade80" : "#f87171") : "var(--theme-text3)"
                },
                {
                  label: "EMA 50",
                  value: data.indicators.ema50 !== null && data.indicators.ema50 !== undefined ? formatINR(data.indicators.ema50) : "—",
                  note: data.indicators.ema50 !== null && data.indicators.ema50 !== undefined ? (data.lastPrice > data.indicators.ema50 ? "Above" : "Below") : "—",
                  color: data.indicators.ema50 !== null && data.indicators.ema50 !== undefined ? (data.lastPrice > data.indicators.ema50 ? "#4ade80" : "#f87171") : "var(--theme-text3)"
                },
                {
                  label: "Volume",
                  value: data.indicators.volume !== null && data.indicators.volume !== undefined ? data.indicators.volume : "—",
                  note: data.indicators.volume !== null && data.indicators.volume !== undefined ? "Avg Daily" : "—",
                  color: "var(--theme-text3)"
                },
              ].map(ind => (
                <div key={ind.label} style={{ background: themeMode === "light" ? "rgba(255,255,255,0.45)" : "var(--theme-input)", border: "1px solid var(--theme-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 1, marginBottom: 6 }}>{ind.label}</div>
                  <div className="mono-font" style={{ fontSize: 15, fontWeight: 700, color: "var(--theme-text)", marginBottom: 4 }}>{ind.value}</div>
                  <div style={{ fontSize: 10, color: ind.color, fontWeight: 600 }}>{ind.note}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
