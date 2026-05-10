import React from "react";
import { formatINR, formatDateLabel } from "../utils/formatters";

export function RiskMeter({ score }) {
  const color = score < 35 ? "#00e5a0" : score < 65 ? "#facc15" : "#f87171";
  const label = score < 35 ? "LOW" : score < 65 ? "MEDIUM" : "HIGH";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#8899aa", letterSpacing: 1 }}>RISK SCORE</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ height: 6, background: "#1e2d3d", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg, #00e5a0, ${color})`, borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
      <div style={{ textAlign: "right", fontSize: 12, color, marginTop: 3, fontWeight: 600 }}>{score}/100</div>
    </div>
  );
}

export function ConfidenceRing({ value }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#1e2d3d" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke="#00e5a0" strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#00e5a0", lineHeight: 1 }}>{value}%</span>
        <span style={{ fontSize: 9, color: "#556677", letterSpacing: 0.5 }}>CONF</span>
      </div>
    </div>
  );
}

export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0]?.payload;
  if (!data) return null;
  const displayLabel = Number.isFinite(Number(label)) ? formatDateLabel(Number(label)) : label;
  
  return (
    <div style={{ background: "#0d1a26", border: "1px solid #1e3a52", borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
      <div style={{ color: "#8899aa", marginBottom: 4 }}>{displayLabel}</div>
      {data.actual !== null && (
        <div style={{ color: "#4a9eff", fontWeight: 600 }}>
          Actual: {formatINR(data.actual)}
        </div>
      )}
      {data.predicted !== null && (
        <div style={{ color: "#00e5a0", fontWeight: 600 }}>
          Forecast: {formatINR(data.predicted)}
        </div>
      )}
      {data.lower !== null && data.upper !== null && (
        <div style={{ color: "#00e5a030", fontSize: 10, marginTop: 2 }}>
          Range: {formatINR(data.lower)} - {formatINR(data.upper)}
        </div>
      )}
    </div>
  );
}