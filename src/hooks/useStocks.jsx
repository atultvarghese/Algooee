import { useState, useEffect } from "react";
import { API_BASE } from "../utils/constants";
import { buildEmptyStockData, getCandleRows, extractCandlePoint, normalizeTimestamp } from "../utils/dataHelpers";
import { formatDateLabel } from "../utils/formatters";

export default function useStocks() {
  const [stocks, setStocks] = useState([]);
  const [selected, setSelected] = useState("");
  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(false);
  const [remoteStocks, setRemoteStocks] = useState(null);
  
  const [stockBusy, setStockBusy] = useState(false);
  const [stockNotice, setStockNotice] = useState("");
  const [stockError, setStockError] = useState("");

  async function fetchWatchlistStocks() {
    try {
      const res = await fetch(`${API_BASE}/api/stocks`);
      if (!res.ok) throw new Error("Failed to fetch stocks");
      const json = await res.json();
      const list = (json.stocks || []).map((s) => ({
        ticker: s.isin || s.ticker || s.id,
        name: s.name || s.company || "",
        last_price: s.last_price ?? s.lastPrice ?? null,
      }));
      setRemoteStocks(list);
      setStocks(list);
      if (list.length) {
        if (!selected || !list.some((row) => row.ticker === selected)) {
          setSelected(list[0].ticker);
        }
      } else {
        setSelected("");
      }
    } catch (err) {
      console.error("Error fetching remote stocks", err);
      setStocks([]);
      setRemoteStocks([]);
    }
  }

  async function addWatchlistStock(isinInput, nameInput) {
    const isin = (isinInput || "").trim().toUpperCase();
    const name = (nameInput || "").trim();
    if (!isin || !name) {
      setStockError(!isin ? "Enter ISIN to add stock." : "Enter stock name to add stock.");
      return false;
    }
    setStockBusy(true); setStockError(""); setStockNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/stocks/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isin, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `Add stock failed: ${res.status}`);
      const list = (json.stocks || []).map((s) => ({
        ticker: s.isin || s.ticker || s.id,
        name: s.name || s.company || "",
        last_price: s.last_price ?? s.lastPrice ?? null,
      }));
      setRemoteStocks(list);
      setStocks(list);
      setSelected(isin);
      setStockNotice(`Added ${name} (${isin}) to watchlist.`);
      setTimeout(() => setStockNotice(""), 2500);
      return true;
    } catch (err) {
      setStockError(err.message || "Unable to add stock.");
      return false;
    } finally {
      setStockBusy(false);
    }
  }

  async function removeWatchlistStock(ticker) {
    const isin = (ticker || "").trim().toUpperCase();
    if (!isin) return;
    const ok = window.confirm(`Remove ${isin} from watchlist?`);
    if (!ok) return;

    setStockBusy(true); setStockError(""); setStockNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/stocks/${encodeURIComponent(isin)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `Remove stock failed: ${res.status}`);
      const list = (json.stocks || []).map((s) => ({
        ticker: s.isin || s.ticker || s.id,
        name: s.name || s.company || "",
        last_price: s.last_price ?? s.lastPrice ?? null,
      }));
      setRemoteStocks(list);
      setStocks(list);
      setStockData((prev) => {
        const next = { ...prev };
        delete next[isin];
        return next;
      });
      if (!list.some((s) => s.ticker === selected)) {
        setSelected(list[0]?.ticker || "");
      }
      setStockNotice(`Removed ${isin} from watchlist.`);
      setTimeout(() => setStockNotice(""), 2500);
    } catch (err) {
      setStockError(err.message || "Unable to remove stock.");
    } finally {
      setStockBusy(false);
    }
  }

  async function loadStock(ticker) {
    if (!ticker || stockData[ticker]) return;
    setLoading(true);
    try {
      const isin = ticker;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 180);
      const fmt = d => d.toISOString().slice(0, 10);

      const histResp = await fetch(`${API_BASE}/api/historical-candles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: 'day', count: 1 })
      });
      if (!histResp.ok) throw new Error(`History fetch failed: ${histResp.status}`);
      const histJson = await histResp.json();

      const candleRows = getCandleRows(histJson);
      const rawHistory = candleRows
        .map((row, idx) => {
          const { ts, price } = extractCandlePoint(row);
          if (!Number.isFinite(price)) return null;
          return { idx, ts, price: +price.toFixed(2) };
        })
        .filter(Boolean);

      const historySeed = rawHistory.slice().sort((a, b) => {
        if (a.ts === null && b.ts === null) return a.idx - b.idx;
        if (a.ts === null) return 1;
        if (b.ts === null) return -1;
        return a.ts - b.ts;
      });

      const historyBaseTs = historySeed.find((row) => row.ts !== null)?.ts ?? (Date.now() - historySeed.length * 86400000);

      const history = historySeed
        .map((row, i) => {
          const ts = row.ts ?? (historyBaseTs + i * 86400000);
          return { ts, dateLabel: formatDateLabel(ts), price: row.price };
        })
        .sort((a, b) => a.ts - b.ts);

      let predJson = {};
      try {
        const predResp = await fetch(`${API_BASE}/api/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isin, start_date: fmt(start), end_date: fmt(end), interval: "day", count: 1, forecast_days: 5, backtest_days: 20 }),
        });
        if (predResp.ok) predJson = await predResp.json();
      } catch (predErr) { console.warn(`Predict fetch error for ${ticker}:`, predErr); }

      const predictionContainer = predJson?.predicted_high && typeof predJson.predicted_high === "object" ? predJson.predicted_high : predJson;
      const predictedHigh = Number(predictionContainer?.predicted_high ?? predJson?.predicted_high);
      const intervalLow = Number(predictionContainer?.p10 ?? predJson?.p10);
      const intervalHigh = Number(predictionContainer?.p90 ?? predJson?.p90);
      const lastPrice = history.length ? history[history.length - 1].price : Number.isFinite(predictedHigh) ? predictedHigh : 0;
      const baseTs = history.length ? history[history.length - 1].ts : Date.now();

      const futureForecast = (predJson.future_forecast || [])
        .map((point, idx) => {
          const fallbackTs = baseTs + (idx + 1) * 86400000;
          const ts = normalizeTimestamp(point.timestamp || point.date || fallbackTs);
          const value = Number(point.predicted_high ?? point.predicted ?? point.price);
          let lower = Number(point.p10 ?? point.lower);
          let upper = Number(point.p90 ?? point.upper);
          if (ts === null || !Number.isFinite(value)) return null;
          if (Number.isFinite(lower) && Number.isFinite(upper) && lower > upper) [lower, upper] = [upper, lower];
          return { ts, dateLabel: formatDateLabel(ts), price: +value.toFixed(2), lower: Number.isFinite(lower) ? +lower.toFixed(2) : null, upper: Number.isFinite(upper) ? +upper.toFixed(2) : null };
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts)
        .slice(0, 5);

      let predicted = futureForecast;
      if (!predicted.length && Number.isFinite(predictedHigh)) {
        let low = Number.isFinite(intervalLow) ? intervalLow : predictedHigh;
        let high = Number.isFinite(intervalHigh) ? intervalHigh : predictedHigh;
        if (Number.isFinite(low) && Number.isFinite(high) && low > high) [low, high] = [high, low];
        predicted = [{ ts: baseTs + 86400000, dateLabel: formatDateLabel(baseTs + 86400000), price: +predictedHigh.toFixed(2), lower: Number.isFinite(low) ? +low.toFixed(2) : null, upper: Number.isFinite(high) ? +high.toFixed(2) : null }];
      }

      const backtest = (predJson.backtest || [])
        .map((point) => {
          const ts = normalizeTimestamp(point.timestamp || point.date);
          const actualHigh = Number(point.actual_high ?? point.actual);
          const predictedValue = Number(point.predicted_high ?? point.predicted);
          if (ts === null || !Number.isFinite(actualHigh) || !Number.isFinite(predictedValue)) return null;
          return { ts, dateLabel: formatDateLabel(ts), actual: +actualHigh.toFixed(2), predicted: +predictedValue.toFixed(2) };
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts);

      const confidenceValue = Number(predJson.confidence);
      const confidence = Number.isFinite(confidenceValue) ? confidenceValue : predJson.confidence === "high" ? 80 : predJson.confidence === "moderate" ? 50 : 0;
      const maeValue = Number(predJson.mae ?? predJson?.forecast?.mae);
      const mapeValue = Number(predJson.mape ?? predJson?.forecast?.mape);
      const p10Value = Number(predJson.p10 ?? predJson?.forecast?.p10);
      const p90Value = Number(predJson.p90 ?? predJson?.forecast?.p90);
      const errorRatioPct = Number.isFinite(maeValue) && Number.isFinite(predictedHigh) && Math.abs(predictedHigh) > 0 ? (maeValue / Math.abs(predictedHigh)) * 100 : NaN;

      const dataObj = {
        ticker: isin,
        name: histJson.isin || isin,
        history,
        backtest,
        predicted,
        lastPrice: +lastPrice,
        change: history.length ? +(lastPrice - history[0].price).toFixed(2) : 0,
        changePct: history.length ? +(((lastPrice - history[0].price) / history[0].price) * 100).toFixed(2) : 0,
        confidence,
        mae: Number.isFinite(maeValue) ? +maeValue.toFixed(4) : null,
        mape: Number.isFinite(mapeValue) ? +mapeValue.toFixed(4) : null,
        p10: Number.isFinite(p10Value) ? +p10Value.toFixed(2) : null,
        p90: Number.isFinite(p90Value) ? +p90Value.toFixed(2) : null,
        errorRatioPct: Number.isFinite(errorRatioPct) ? +errorRatioPct.toFixed(4) : null,
        riskScore: Number.isFinite(+predJson.riskScore) ? +predJson.riskScore : 0,
        trend: predJson.trend || 'Neutral',
        trendStrength: Number.isFinite(+predJson.trendStrength) ? +predJson.trendStrength : 0,
        indicators: {
          rsi: Number.isFinite(+predJson.rsi) ? +predJson.rsi : 0,
          macd: Number.isFinite(+predJson.macd) ? +predJson.macd : 0,
          ema20: Number.isFinite(+predJson.ema20) ? +predJson.ema20 : 0,
          ema50: Number.isFinite(+predJson.ema50) ? +predJson.ema50 : 0,
          volume: predJson.volume ?? 0
        }
      };
      setStockData(d => ({ ...d, [ticker]: dataObj }));
    } catch (e) {
      console.error('Backend fetch failed, using zero-value fallback:', e);
      setStockData(d => ({ ...d, [ticker]: buildEmptyStockData(ticker) }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchWatchlistStocks(); }, []);
  useEffect(() => { loadStock(selected); }, [selected]);

  return {
    stocks, selected, setSelected, stockData, loading, remoteStocks,
    stockBusy, stockError, stockNotice, setStockError, setStockNotice,
    fetchWatchlistStocks, addWatchlistStock, removeWatchlistStock
  };
}