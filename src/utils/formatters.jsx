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

export function formatExactDateTime(dateStr) {
  if (dateStr === null || dateStr === undefined) return "—";
  try {
    const str = String(dateStr);
    let utcStr = str;
    if (!str.includes("Z") && !str.includes("+")) {
      utcStr = str.replace(" ", "T") + "Z";
    }
    const date = new Date(utcStr);
    if (isNaN(date.getTime())) return str;
    
    const pad = (num) => String(num).padStart(2, "0");
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  } catch (err) {
    console.error("Error formatting exact date time:", err);
    return String(dateStr);
  }
}

export function formatPreciseRelativeTime(dateStr) {
  if (dateStr === null || dateStr === undefined) return "—";
  try {
    const str = String(dateStr);
    let utcStr = str;
    if (!str.includes("Z") && !str.includes("+")) {
      utcStr = str.replace(" ", "T") + "Z";
    }
    const date = new Date(utcStr);
    if (isNaN(date.getTime())) return str;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "Just now";

    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const secs = diffSecs % 60;
    const mins = diffMins % 60;
    const hours = diffHours % 24;
    const days = diffDays;

    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
    if (mins > 0) parts.push(`${mins} minute${mins > 1 ? "s" : ""}`);
    if (secs > 0 && parts.length < 3) parts.push(`${secs} second${secs > 1 ? "s" : ""}`);

    if (parts.length === 0) return "Just now";
    return parts.join(", ") + " back";
  } catch (err) {
    console.error("Error formatting precise relative time:", err);
    return String(dateStr);
  }
}