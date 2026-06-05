import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils/constants";

async function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    ...options.headers,
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.reload();
    throw new Error("Unauthorized");
  }
  return res;
}

export default function OptionsChainView({
  stocks,
  selectedUnderlying,
  themeMode,
  theme,
  setSelectedUnderlying,
  paper,
  paperBusy,
  placePaperOrder,
  formatINR,
  selectedOptionContract,
  setSelectedOptionContract,
  isMobile = false
}) {
  const [underlying, setUnderlying] = useState(selectedUnderlying || "NIFTY");
  const [expiries, setExpiries] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [chain, setChain] = useState([]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Trade widget states
  const [tradeContract, setTradeContract] = useState(null); // { key, symbol, strike, type, ltp, side }
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeNotice, setTradeNotice] = useState("");

  const isLight = themeMode === "light";

  const cardStyle = isLight
    ? {
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.5)",
        boxShadow: "0 8px 24px rgba(37,99,235,.12)"
      }
    : {
        background: "#08101a",
        border: "1px solid #142234"
      };

  const blueHeader = isLight
    ? "linear-gradient(135deg,#2563eb,#3b82f6)"
    : "#0c1827";
    
  // Options list for underlying selector
  const underlyingOptions = [
    { value: "NIFTY", label: "NIFTY 50 (Index)" },
    { value: "BANKNIFTY", label: "NIFTY BANK (Index)" },
    ...stocks.map(s => ({ value: s.ticker, label: `${s.name} (${s.ticker})` }))
  ];

  // Sync underlying from parent selection
  useEffect(() => {
    if (selectedUnderlying) {
      setUnderlying(selectedUnderlying);
    }
  }, [selectedUnderlying]);

  // Fetch expiries whenever underlying changes
  useEffect(() => {
    async function fetchExpiries() {
      setLoading(true);
      setError("");
      setChain([]);
      try {
        const resp = await authFetch(`${API_BASE}/api/options/expiries/${encodeURIComponent(underlying)}`);
        if (!resp.ok) {
          const errJson = await resp.json();
          throw new Error(errJson.detail || "Failed to load option expiries.");
        }
        const json = await resp.json();
        setExpiries(json.expiries || []);
        if (selectedOptionContract && json.expiries && json.expiries.includes(selectedOptionContract.expiry)) {
          setSelectedExpiry(selectedOptionContract.expiry);
        } else if (json.expiries && json.expiries.length > 0) {
          setSelectedExpiry(json.expiries[0]);
        } else {
          setSelectedExpiry("");
          setError("No active option contracts found for this underlying.");
        }
      } catch (err) {
        console.error("Expiries fetch error:", err);
        setError(err.message || "Failed to load option expiries.");
      } finally {
        setLoading(false);
      }
    }
    fetchExpiries();
  }, [underlying, selectedOptionContract]);

  // Fetch option chain whenever underlying or selectedExpiry changes
  useEffect(() => {
    if (!selectedExpiry) return;

    async function fetchOptionChain() {
      setLoading(true);
      setError("");
      try {
        const resp = await authFetch(`${API_BASE}/api/options/chain?underlying_key=${encodeURIComponent(underlying)}&expiry_date=${selectedExpiry}`);
        if (!resp.ok) {
          const errJson = await resp.json();
          throw new Error(errJson.detail || "Failed to load option chain.");
        }
        const json = await resp.json();
        setChain(json.chain || []);
        if (json.chain && json.chain.length > 0) {
          setSpotPrice(json.chain[0].underlying_spot_price || null);
        }
      } catch (err) {
        console.error("Option chain fetch error:", err);
        setError(err.message || "Failed to load option chain.");
      } finally {
        setLoading(false);
      }
    }
    fetchOptionChain();
  }, [underlying, selectedExpiry]);

  // Pre-select options contract from admin page
  useEffect(() => {
    if (selectedOptionContract && chain.length > 0) {
      const matchingRow = chain.find(row => {
        if (selectedOptionContract.type === "CE") {
          return row.call_options?.instrument_key === selectedOptionContract.key;
        } else {
          return row.put_options?.instrument_key === selectedOptionContract.key;
        }
      });

      if (matchingRow) {
        const option = selectedOptionContract.type === "CE" ? matchingRow.call_options : matchingRow.put_options;
        const market = option?.market_data;
        if (option) {
          setTradeContract({
            key: option.instrument_key,
            symbol: option.trading_symbol || `${underlying} ${matchingRow.strike_price} ${selectedOptionContract.type}`,
            strike: matchingRow.strike_price,
            type: selectedOptionContract.type,
            ltp: market?.ltp || selectedOptionContract.ltp || 0,
            side: "buy",
            lotSize: option.lot_size || 1
          });
          setTradeAmount(String(option.lot_size || 1));
          setSelectedOptionContract(null);
        }
      }
    }
  }, [selectedOptionContract, chain, underlying, setSelectedOptionContract]);

  // Set default execution price when contract to trade changes
  useEffect(() => {
    if (tradeContract) {
      setTradePrice(tradeContract.ltp ? tradeContract.ltp.toFixed(2) : "");
    }
  }, [tradeContract]);

  const handlePlaceOrder = async () => {
    if (!tradeContract) return;
    const qty = Number(tradeAmount);
    const price = Number(tradePrice);
    const lotSize = tradeContract.lotSize || 1;

    if (qty <= 0 || qty % lotSize !== 0) {
      setTradeNotice(`Quantity must be a multiple of the lot size (${lotSize})`);
      return;
    }

    const finalAmount = qty * price;

    const success = await placePaperOrder(
      tradeContract.side,
      tradeContract.key,
      finalAmount,
      price,
      tradeContract.symbol,
      selectedExpiry
    );
    if (success) {
      setTradeNotice(`Option ${tradeContract.side.toUpperCase()} order executed!`);
      setTimeout(() => {
        setTradeNotice("");
        setTradeContract(null);
        setTradeAmount("");
      }, 2500);
    }
  };

  // Find ATM strike: the strike price closest to the spot price
  const atmStrike = chain.reduce((prev, curr) => {
    if (!spotPrice) return null;
    return Math.abs(curr.strike_price - spotPrice) < Math.abs(prev.strike_price - spotPrice) ? curr : prev;
  }, chain[0])?.strike_price;

  // Aggregate totals
  const totalCallOI = chain.reduce((acc, curr) => acc + (curr.call_options?.market_data?.oi || 0), 0);
  const totalPutOI = chain.reduce((acc, curr) => acc + (curr.put_options?.market_data?.oi || 0), 0);
  const pcrRatio = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : "0.00";

  // Mobile Quick Trade Sheet Styles
  const mobileOverlayStyle = {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0, 0, 0, 0.65)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    zIndex: 99999,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center"
  };

  const mobilePanelStyle = {
    ...cardStyle,
    borderRadius: "20px 20px 0 0",
    padding: "24px 20px 32px 20px",
    width: "100%",
    maxWidth: "500px",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
    zIndex: 100000,
    maxHeight: "90vh",
    overflowY: "auto",
    animation: "slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)"
  };

  const tradeWidgetContent = tradeContract && (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: isLight ? "#1f2937" : "#fff", fontWeight: 700, letterSpacing: 1 }}>PAPER TRADE OPTION</div>
        <button
          onClick={() => setTradeContract(null)}
          style={{ background: "transparent", border: "none", color: "#556a84", cursor: "pointer", fontSize: 14, outline: "none" }}
        >
          ✕
        </button>
      </div>

      {/* Contract Summary */}
      <div style={{ background: isLight ? "rgba(0,0,0,0.03)" : "#050b12", border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{tradeContract.symbol}</span>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
            background: tradeContract.type === "CE" ? "#00e5a022" : "#ef444422",
            color: tradeContract.type === "CE" ? "#00e5a0" : "#fca5a5"
          }}>
            {tradeContract.type}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#556a84", marginTop: 6 }}>
          Underlying Expiry: <span style={{ color: theme.text }}>{selectedExpiry}</span>
        </div>
        <div style={{ fontSize: 11, color: "#556a84", marginTop: 4 }}>
          Lot Size: <span style={{ color: theme.text }}>{tradeContract.lotSize}</span>
        </div>
        <div style={{ fontSize: 11, color: "#556a84", marginTop: 4 }}>
          Current LTP: <span style={{ color: "#00e5a0", fontWeight: 600 }}>{formatINR(tradeContract.ltp)}</span>
        </div>
      </div>

      {/* Form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Buy/Sell Side Selector */}
        <div>
          <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600 }}>TRANSACTION SIDE</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setTradeContract(prev => ({ ...prev, side: "buy" }))}
              style={{
                flex: 1, padding: "8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: tradeContract.side === "buy" ? "#0f2a24" : (isLight ? "#f3f4f6" : "#050b12"),
                color: tradeContract.side === "buy" ? "#4ade80" : "#556a84",
                border: `1px solid ${tradeContract.side === "buy" ? "#4ade8055" : theme.border}`
              }}
            >
              BUY (Long)
            </button>
            <button
              onClick={() => setTradeContract(prev => ({ ...prev, side: "sell" }))}
              style={{
                flex: 1, padding: "8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: tradeContract.side === "sell" ? "#2a1218" : (isLight ? "#f3f4f6" : "#050b12"),
                color: tradeContract.side === "sell" ? "#f87171" : "#556a84",
                border: `1px solid ${tradeContract.side === "sell" ? "#f8717155" : theme.border}`
              }}
            >
              SELL (Short)
            </button>
          </div>
        </div>

        {/* Quantity input */}
        <div>
          <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600 }}>QUANTITY TO TRADE (LOT MULTIPLE)</label>
          <input
            type="number" min={tradeContract.lotSize} step={tradeContract.lotSize} value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)}
            placeholder={`E.g. ${tradeContract.lotSize}, ${tradeContract.lotSize * 2}, etc.`}
            style={{
              width: "100%", background: isLight
                ? "rgba(255,255,255,.5)"
                : "#050b12",
              color: theme.text, border: `1px solid ${theme.border}`,
              borderRadius: 8, padding: "10px 12px",
              fontSize: 12, outline: "none"
            }}
          />
        </div>

        {/* Execution Price input */}
        <div>
          <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600 }}>EXECUTION PRICE (INR)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number" min="0" step="0.01" value={tradePrice} onChange={(e) => setTradePrice(e.target.value)}
              placeholder="Premium Price"
              style={{
                flex: 1, background: isLight
                  ? "rgba(255,255,255,.5)"
                  : "#050b12",
                color: theme.text, border: `1px solid ${theme.border}`,
                borderRadius: 8, padding: "10px 12px",
                fontSize: 12, outline: "none"
              }}
            />
            <button
              onClick={() => setTradePrice(tradeContract.ltp.toFixed(2))}
              style={{
                background: isLight ? "#f3f4f6" : "#0a1520", color: theme.text2, border: `1px solid ${theme.border}`,
                borderRadius: 8, padding: "0 10px", fontSize: 10, cursor: "pointer"
              }}
            >
              Use LTP
            </button>
          </div>
        </div>

        {/* Premium calculation */}
        {tradeAmount && tradePrice && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9bb0c4", marginTop: 4 }}>
            <span>Est. Premium Cost:</span>
            <span style={{ color: "#9fe7ff", fontWeight: 600 }}>
              {formatINR(Number(tradeAmount) * Number(tradePrice))}
            </span>
          </div>
        )}

        {/* Balance view */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#556a84", marginTop: 4 }}>
          <span>Wallet Balance:</span>
          <span style={{ color: "#00e5a0", fontWeight: 600 }}>{formatINR(paper.cash_balance)}</span>
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}`, margin: "8px 0" }} />

        {/* Submit */}
        <button
          onClick={handlePlaceOrder} disabled={paperBusy || !tradeAmount || !tradePrice}
          style={{
            width: "100%", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700,
            cursor: (paperBusy || !tradeAmount || !tradePrice) ? "not-allowed" : "pointer",
            background: tradeContract.side === "buy" ? "#0f2a24" : "#2a1218",
            color: tradeContract.side === "buy" ? "#4ade80" : "#f87171",
            border: `1px solid ${tradeContract.side === "buy" ? "#4ade8055" : "#f8717155"}`,
            opacity: (paperBusy || !tradeAmount || !tradePrice) ? 0.5 : 1
          }}
        >
          {paperBusy ? "PROCESSING..." : `CONFIRM ${tradeContract.side.toUpperCase()} ORDER`}
        </button>

        {tradeNotice && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 11, textAlign: "center",
            background: "#051612", color: "#7cfccf", border: "1px solid #00e5a033"
          }}>
            {tradeNotice}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
      {/* Expiry and Underlying Selectors */}
      <div style={{
        ...cardStyle,
        borderRadius: 12, padding: isMobile ? "16px" : "18px 24px",
        display: "flex", flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
        gap: isMobile ? 16 : 20,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
      }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 20, alignItems: isMobile ? "stretch" : "center" }}>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>UNDERLYING</label>
            <select
              value={underlying}
              onChange={(e) => {
                setUnderlying(e.target.value);
                setSelectedUnderlying(e.target.value);
              }}
              style={{
                background: isLight
                ? "rgba(255,255,255,.5)"
                : "#050b12",

              color: isLight
                ? "#111827"
                : "#cde", border: "1px solid #142234",
                borderRadius: 8, padding: "8px 12px",
                fontSize: 12, outline: "none", cursor: "pointer",
                width: isMobile ? "100%" : "auto"
              }}
            >
              {underlyingOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>EXPIRY DATE</label>
            <select
              value={selectedExpiry}
              onChange={(e) => setSelectedExpiry(e.target.value)}
              disabled={expiries.length === 0}
              style={{
                background: isLight
                  ? "rgba(255,255,255,.5)"
                  : "#050b12",

                color: isLight
                  ? "#111827"
                  : "#cde",border: "1px solid #142234",
                borderRadius: 8, padding: "8px 12px",
                fontSize: 12, outline: "none", cursor: "pointer",
                width: isMobile ? "100%" : "auto"
              }}
            >
              {expiries.map(exp => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Spot and PCR Overview */}
        {spotPrice && (
          <div style={{
            display: "flex", flexDirection: "row", flexWrap: "wrap",
            justifyContent: isMobile ? "space-between" : "flex-end",
            gap: isMobile ? 16 : 24,
            borderTop: isMobile ? "1px solid #142234" : "none",
            paddingTop: isMobile ? 12 : 0,
            marginTop: isMobile ? 4 : 0,
            width: isMobile ? "100%" : "auto"
          }}>
            <div style={{ textAlign: isMobile ? "left" : "right", flex: isMobile ? "1 1 40%" : "auto" }}>
              <div style={{ fontSize: 10, color: "#556a84", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" }}>Spot Price</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#00e5a0", marginTop: 4 }}>
                {formatINR(spotPrice)}
              </div>
            </div>
            <div style={{ textAlign: isMobile ? "left" : "right", flex: isMobile ? "1 1 40%" : "auto" }}>
              <div style={{ fontSize: 10, color: "#556a84", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" }}>Put-Call Ratio (PCR)</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#9fe7ff", marginTop: 4 }}>
                {pcrRatio}
              </div>
            </div>
            <div style={{ textAlign: isMobile ? "left" : "right", flex: isMobile ? "1 1 40%" : "auto" }}>
              <div style={{ fontSize: 10, color: "#556a84", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" }}>Call / Put OI</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 600, color: "#cde", marginTop: 6 }}>
                {(totalCallOI / 100000).toFixed(1)}L / {(totalPutOI / 100000).toFixed(1)}L
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Option Chain & Trade Panel Split */}
      <div style={{ display: "grid", gridTemplateColumns: (tradeContract && !isMobile) ? "1fr 340px" : "1fr", gap: "24px", alignItems: "start" }}>
        
        {/* Left Side: Option Chain Table */}
        <div style={{
          ...cardStyle,
          borderRadius: 12, padding: "20px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
          overflowX: "auto"
        }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px", gap: 16 }}>
              <div style={{
                width: 36,
                height: 36,
                border: "3px solid rgba(0, 229, 160, 0.15)",
                borderTop: "3px solid #00e5a0",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }} />
              <div style={{ color: "#8899aa", fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>
                Loading Option Chain data...
              </div>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#fca5a5", fontSize: 12 }}>
              {error}
            </div>
          ) : chain.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#556a84", fontSize: 12 }}>
              Select an underlying and expiry date to load the option chain.
            </div>
          ) : (
            <div style={{ minWidth: isMobile ? "900px" : "auto" }}>
              {/* Option Chain Headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1.2fr 0.8fr 1fr 0.8fr 1.2fr 1fr 1fr 1fr",
                background: blueHeader, color: "#ffffff",
                fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                textAlign: "center", borderBottom: "1px solid #142234"
              }}>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>OI (Call)</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>Vol</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>Delta</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>LTP</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>Trade</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234", background: "#0a1320", color: "#fff" }}>Strike</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>Trade</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>LTP</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>Delta</div>
                <div style={{ padding: "12px 6px", borderRight: "1px solid #142234" }}>Vol</div>
                <div style={{ padding: "12px 6px" }}>OI (Put)</div>
              </div>

              {/* Option Chain Rows */}
              <div style={{ display: "flex", flexDirection: "column", maxHeight: "650px", overflowY: "auto" }}>
                {chain.map((row) => {
                  const isAtm = row.strike_price === atmStrike;
                  const cMarket = row.call_options?.market_data;
                  const pMarket = row.put_options?.market_data;
                  const cGreeks = row.call_options?.option_greeks;
                  const pGreeks = row.put_options?.option_greeks;

                  return (
                    <div
                      key={row.strike_price}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1.2fr 0.8fr 1fr 0.8fr 1.2fr 1fr 1fr 1fr",
                        borderBottom: "1px solid #142234",
                        fontSize: 11,
                        background: isLight
                          ? (
                              isAtm
                                ? "rgba(37,99,235,.15)"
                                : "rgba(255,255,255,.35)"
                            )
                          : (
                              isAtm
                                ? "#0a2228"
                                : "#08101a"
                            ),

                        color: isLight ? "#111827" : "#cde",
                        alignItems: "center",
                        textAlign: "center"
                      }}
                    >
                      {/* CALL OPTION DATA */}
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#8899aa", fontFamily: "'Space Mono', monospace" }}>
                        {cMarket?.oi ? `${(cMarket.oi / 1000).toFixed(0)}k` : "—"}
                      </div>
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#8899aa", fontFamily: "'Space Mono', monospace" }}>
                        {cMarket?.volume ? `${(cMarket.volume / 1000).toFixed(0)}k` : "—"}
                      </div>
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#00e5a0", fontFamily: "'Space Mono', monospace" }}>
                        {cGreeks?.delta ? cGreeks.delta.toFixed(2) : "—"}
                      </div>
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#e8f4ff", fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>
                        {cMarket?.ltp ? formatINR(cMarket.ltp) : "—"}
                      </div>
                      <div style={{ padding: "6px 2px", borderRight: "1px solid #142234" }}>
                        {row.call_options && (
                          <button
                            onClick={() => {
                              setTradeContract({
                                key: row.call_options.instrument_key,
                                symbol: `${underlying} ${row.strike_price} CE`,
                                strike: row.strike_price,
                                type: "CE",
                                ltp: cMarket?.ltp || 0,
                                side: "buy",
                                lotSize: row.call_options.lot_size || 1
                              });
                              setTradeAmount(String(row.call_options.lot_size || 1));
                            }}
                            style={{
                              background: "#00e5a015", color: "#00e5a0", border: "1px solid #00e5a044",
                              borderRadius: 4, padding: "4px 8px", fontSize: 9, cursor: "pointer", fontWeight: 700
                            }}
                          >
                            TRADE
                          </button>
                        )}
                      </div>

                      {/* STRIKE PRICE */}
                      <div style={{
                        padding: "8px 4px", borderRight: "1px solid #142234",
                        background: isLight
                          ? "#1d4ed8"
                          : "#0a1320",

                        color: "#fff", fontWeight: 700,
                        fontFamily: "'Space Mono', monospace"
                      }}>
                        {row.strike_price}
                      </div>

                      {/* PUT OPTION DATA */}
                      <div style={{ padding: "6px 2px", borderRight: "1px solid #142234" }}>
                        {row.put_options && (
                          <button
                            onClick={() => {
                              setTradeContract({
                                key: row.put_options.instrument_key,
                                symbol: `${underlying} ${row.strike_price} PE`,
                                strike: row.strike_price,
                                type: "PE",
                                ltp: pMarket?.ltp || 0,
                                side: "buy",
                                lotSize: row.put_options.lot_size || 1
                              });
                              setTradeAmount(String(row.put_options.lot_size || 1));
                            }}
                            style={{
                              background: "#00e5a015", color: "#00e5a0", border: "1px solid #00e5a044",
                              borderRadius: 4, padding: "4px 8px", fontSize: 9, cursor: "pointer", fontWeight: 700
                            }}
                          >
                            TRADE
                          </button>
                        )}
                      </div>
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#e8f4ff", fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>
                        {pMarket?.ltp ? formatINR(pMarket.ltp) : "—"}
                      </div>
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#f87171", fontFamily: "'Space Mono', monospace" }}>
                        {pGreeks?.delta ? pGreeks.delta.toFixed(2) : "—"}
                      </div>
                      <div style={{ padding: "8px 4px", borderRight: "1px solid #142234", color: "#8899aa", fontFamily: "'Space Mono', monospace" }}>
                        {pMarket?.volume ? `${(pMarket.volume / 1000).toFixed(0)}k` : "—"}
                      </div>
                      <div style={{ padding: "8px 4px", color: "#8899aa", fontFamily: "'Space Mono', monospace" }}>
                        {pMarket?.oi ? `${(pMarket.oi / 1000).toFixed(0)}k` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Options Quick Trade panel (Desktop View) */}
        {tradeContract && !isMobile && (
          <div style={{
            ...cardStyle,
            borderRadius: 12, padding: "20px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
            position: "sticky", top: 20
          }}>
            {tradeWidgetContent}
          </div>
        )}
      </div>

      {/* Mobile Quick Trade panel Bottom Sheet */}
      {tradeContract && isMobile && (
        <div style={mobileOverlayStyle} onClick={() => setTradeContract(null)}>
          <div style={mobilePanelStyle} onClick={(e) => e.stopPropagation()}>
            {tradeWidgetContent}
          </div>
        </div>
      )}

      {/* Slide up animation styling */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
