import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8000";

export function usePaperTrade() {
  const [paper, setPaper] = useState({ cash_balance: 0, positions: [], trades: [] });
  const [paperBusy, setPaperBusy] = useState(false);
  const [paperNotice, setPaperNotice] = useState("");
  const [paperError, setPaperError] = useState("");

  const refreshPaperPortfolio = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/paper/portfolio`);
      const json = await res.json();
      setPaper(json);
    } catch (err) {
      console.error("Portfolio sync error:", err);
    }
  }, []);

  const placePaperOrder = async (isin, side, amount, price) => {
    if (!isin || !amount) return;
    setPaperBusy(true);
    setPaperError("");
    setPaperNotice("");
    
    try {
      const res = await fetch(`${API_BASE}/api/paper/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isin, side, amount: Number(amount), price: Number(price) }),
      });
      const json = await res.json();
      if (res.ok) {
        setPaper(json.portfolio);
        setPaperNotice(`${side.toUpperCase()} executed.`);
        return { success: true };
      } else {
        setPaperError("Trade failed.");
        return { success: false };
      }
    } catch (err) {
      setPaperError("Server error.");
      return { success: false };
    } finally {
      setPaperBusy(false);
    }
  };

  useEffect(() => {
    refreshPaperPortfolio();
  }, [refreshPaperPortfolio]);

  return { 
    paper, paperBusy, paperNotice, paperError, 
    setPaperNotice, setPaperError, placePaperOrder, refreshPaperPortfolio 
  };
}