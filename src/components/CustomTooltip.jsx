import { formatINR, formatDateLabel } from "../utils/formatters";

export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  const displayLabel = Number.isFinite(Number(label)) ? formatDateLabel(Number(label)) : label;
  
  return (
    <div style={{ background: "#0d1a26", border: "1px solid #1e3a52", borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
      <div style={{ color: "#8899aa", marginBottom: 4 }}>{displayLabel}</div>
      {data.actual !== null && (
        <div style={{ color: "#4a9eff", fontWeight: 600 }}>Actual: {formatINR(data.actual)}</div>
      )}
      {data.predicted !== null && (
        <div style={{ color: "#00e5a0", fontWeight: 600 }}>Forecast: {formatINR(data.predicted)}</div>
      )}
      {data.lower !== null && data.upper !== null && (
        <div style={{ color: "#00e5a030", fontSize: 10, marginTop: 2 }}>
          Range: {formatINR(data.lower)} - {formatINR(data.upper)}
        </div>
      )}
    </div>
  );
}