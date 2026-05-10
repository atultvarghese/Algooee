export function RiskMeter({ score }) {
  const color = score < 35 ? "#00e5a0" : score < 65 ? "#facc15" : "#f87171";
  const label = score < 35 ? "LOW" : score < 65 ? "MEDIUM" : "HIGH";
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#8899aa", letterSpacing: 1 }}>RISK SCORE</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ height: 6, background: "#1e2d3d", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg, #00e5a0, ${color})`, transition: "width 0.8s ease" }} />
      </div>
      <div style={{ textAlign: "right", fontSize: 12, color, marginTop: 3, fontWeight: 600 }}>{score}/100</div>
    </div>
  );
}