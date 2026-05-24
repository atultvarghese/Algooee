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

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  let utcStr = dateStr;
  if (!dateStr.includes("Z") && !dateStr.includes("+")) {
    utcStr = dateStr.replace(" ", "T") + "Z";
  }
  const date = new Date(utcStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return "—";
  let utcStr = dateStr;
  if (!dateStr.includes("Z") && !dateStr.includes("+")) {
    utcStr = dateStr.replace(" ", "T") + "Z";
  }
  const date = new Date(utcStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 10) return "Just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffMonths === 1) return "1mo ago";
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  if (diffYears === 1) return "1yr ago";
  return `${diffYears}yr ago`;
}