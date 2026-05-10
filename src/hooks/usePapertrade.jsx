import { useState, useEffect } from "react";
import { API_BASE } from "../utils/constants";

export default function usePaperTrade() {
  const [paperPortfolio, setPaperPortfolio] = useState(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperBusy, setPaperBusy] = useState(false);
  const [paperError, setPaperError] = useState("");
  const [paperNotice, setPaperNotice] = useState("");

  async function refreshPaperPortfolio(showLoader = false) {
    if (showLoader) setPaperLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/paper/portfolio`);
      if (!res.ok) throw new Error(`Paper portfolio fetch failed: ${res.status}`);
      const json = await res.json();
      setPaperPortfolio(json);
      setPaperError("");
    } catch (err) {
      console.error("Paper portfolio error:", err);
      setPaperError("Unable to load paper trading data.");
    } finally {
      if (showLoader) setPaperLoading(false);
    }
  }

  async function placePaperOrder(side, selected, amount, executionPrice) {
    if (!selected) {
      setPaperError("Select a stock before placing an order.");
      return false;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaperError("Enter a valid amount to trade.");
      return false;
    }
    if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
      setPaperError("Enter a valid execution price.");
      return false;
    }

    setPaperBusy(true); setPaperError(""); setPaperNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/paper/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isin: selected, side, amount, price: executionPrice }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `Paper trade failed: ${res.status}`);
      setPaperPortfolio(json.portfolio || null);
      setPaperNotice(`${side.toUpperCase()} order executed successfully.`);
      return true;
    } catch (err) {
      console.error("Paper trade error:", err);
      setPaperError(err.message || "Paper trade failed.");
      return false;
    } finally {
      setPaperBusy(false);
    }
  }

  async function addPaperFunds(fundAmount) {
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaperError("Enter a valid funding amount.");
      return false;
    }
    setPaperBusy(true); setPaperError(""); setPaperNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/paper/admin/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `Funding failed: ${res.status}`);
      setPaperPortfolio(json);
      setPaperNotice("Funds added to paper wallet.");
      return true;
    } catch (err) {
      console.error("Paper funding error:", err);
      setPaperError(err.message || "Funding failed.");
      return false;
    } finally {
      setPaperBusy(false);
    }
  }

  async function resetPaperAccount() {
    const ok = window.confirm("Reset paper account? This clears all holdings and trades.");
    if (!ok) return false;
    setPaperBusy(true); setPaperError(""); setPaperNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/paper/admin/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_cash: 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `Reset failed: ${res.status}`);
      setPaperPortfolio(json);
      setPaperNotice("Paper account reset completed.");
      return true;
    } catch (err) {
      console.error("Paper reset error:", err);
      setPaperError(err.message || "Reset failed.");
      return false;
    } finally {
      setPaperBusy(false);
    }
  }

  useEffect(() => {
    refreshPaperPortfolio(true);
    const timer = setInterval(() => { refreshPaperPortfolio(false); }, 30000);
    return () => clearInterval(timer);
  }, []);

  return {
    paperPortfolio, paperLoading, paperBusy, paperError, paperNotice,
    refreshPaperPortfolio, placePaperOrder, addPaperFunds, resetPaperAccount
  };
}