import { useState, useEffect } from "react";
import { formatDateLabel } from "../utils/formatters";
import { normalizeTimestamp, getCandleRows, extractCandlePoint } from "../utils/dataHelpers";

const API_BASE = "http://localhost:8000";

export function useStocks() {
  const [stocks, setStocks] = useState([]);
  const [selected, setSelected] = useState("");
  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stocks`);
      const json = await res.json();
      const list = (json.stocks || []).map(s => ({
        ticker: s.isin || s.ticker || s.id,
        name: s.name || "",
        last_price: s.last_price ?? null,
      }));
      setStocks(list);
      if (list.length && !selected) setSelected(list[0].ticker);
    } catch (e) { console.error(e); }
  };

  const loadStock = async (ticker) => {
    if (!ticker || stockData[ticker]) return;
    setLoading(true);
    try {
      const fmt = d => d.toISOString().slice(0, 10);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 180);

      const hResp = await fetch(`${API_BASE}/api/historical-candles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isin: ticker, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
      });
      const histJson = await hResp.json();
      const history = getCandleRows(histJson).map(extractCandlePoint)
        .filter(p => Number.isFinite(p.price))
        .map(p => ({ ...p, dateLabel: formatDateLabel(p.ts) }));

      // Simplified for brevity, but keep your full prediction logic here
      setStockData(prev => ({ ...prev, [ticker]: { ticker, history, lastPrice: history.slice(-1)[0]?.price || 0 } }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchWatchlist(); }, []);
  useEffect(() => { loadStock(selected); }, [selected]);

  return { stocks, setStocks, selected, setSelected, stockData, setStockData, loading };
}