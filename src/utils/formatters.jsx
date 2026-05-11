import { toNumberOrNaN } from "./dataHelpers";

export const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatDateLabel(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatINR(value) {
  const n = toNumberOrNaN(value);
  return Number.isFinite(n) ? INR_FORMATTER.format(n) : "—";
}

export function formatPercent(value, digits = 2) {
  const n = toNumberOrNaN(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";
}