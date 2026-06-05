import React from "react";
import { formatINR } from "../utils/formatters";

export default function StockCard({ ticker, selected, data, onClick, onRemove, name, meta, themeMode }) {
  if (!data && !meta) return null;
  const up = (data?.changePct ?? 0) >= 0;
  const displayName = name || data?.name || ticker;
  const displayLast = data?.lastPrice ?? meta?.last_price ?? "—";
  const isLight = themeMode === "light";
  return (
    <div onClick={onClick} style={{
      background: isLight
        ? (
            selected
              ? "linear-gradient(135deg,#2563eb,#3b82f6)"
              : "linear-gradient(135deg,#1e40af,#2563eb)"
          )
        : (
            selected
              ? "linear-gradient(135deg,#0d2236 0%, #0f2940 100%)"
              : "#0a1520"
          ),

      border: isLight
        ? `1px solid ${selected ? "#93c5fd" : "#60a5fa"}`
        : `1px solid ${selected ? "#00e5a060" : "#1a2a3a"}`,

      borderRadius: 10,      // KEEP ORIGINAL
      padding: "14px 16px",  // KEEP ORIGINAL
      cursor: "pointer",
      transition: "all 0.2s",

      boxShadow: selected ? "0 0 20px #00e5a015" : "none" // KEEP ORIGINAL
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: selected ? "#00e5a0" : "#cde" }}>{displayName}</div>
          <div style={{ fontSize: 10, color: "#556677", marginTop: 2 }}>{ticker}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {typeof onRemove === "function" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title="Remove from watchlist"
              style={{ background: "#2a1218", color: "#f87171", border: "1px solid #f8717155", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >
              X
            </button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, color: "#e8f4ff", fontWeight: 700 }}>{formatINR(displayLast)}</span>
        {data?.changePct !== null && data?.changePct !== undefined ? (
          <span style={{ fontSize: 12, color: up ? "#4ade80" : "#f87171", fontWeight: 600 }}>
            {up ? "▲" : "▼"} {Math.abs(data.changePct)}%
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#556677" }}>—</span>
        )}
      </div>
    </div>
  );
}
