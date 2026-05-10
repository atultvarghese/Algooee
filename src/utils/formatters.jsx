// src/utils/formatters.js

export const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/**
 * Converts a raw value to a number or NaN if invalid
 */
export function toNumberOrNaN(value) {
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Formats a numeric value into INR currency string
 */
export function formatINR(value) {
  const n = toNumberOrNaN(value);
  return Number.isFinite(n) ? INR_FORMATTER.format(n) : "—";
}

/**
 * Formats a numeric value into a percentage string
 */
export function formatPercent(value, digits = 2) {
  const n = toNumberOrNaN(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";
}

/**
 * Converts a timestamp (ms) into a "Jan 01" style label for charts
 */
export function formatDateLabel(ts) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) 
    ? "Invalid Date" 
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}