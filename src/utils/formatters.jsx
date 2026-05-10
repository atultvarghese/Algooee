export const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function toNumberOrNaN(value) {
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function formatINR(value) {
  const n = toNumberOrNaN(value);
  return Number.isFinite(n) ? INR_FORMATTER.format(n) : "—";
}

export function formatPercent(value, digits = 2) {
  const n = toNumberOrNaN(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";
}

export function formatDateLabel(ts) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) 
    ? "—" 
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}