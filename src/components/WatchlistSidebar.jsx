import React from "react";
import StockCard from "./StockCard";

export default function WatchlistSidebar({
  themeMode,
  theme,
  isMobile,
  activePage,
  setActivePage,
  showWatchlist,
  setShowWatchlist,
  stockSearch,
  setStockSearch,
  searchResults,
  searchLoading,
  stockError,
  stockNotice,
  selected,
  setSelected,
  setOptionUnderlying,
  stocks,
  remoteStocks,
  removeWatchlistStock,
  addWatchlistStock,
  stockData
}) {
  const watchlistSource = remoteStocks || stocks || [];
  const query = (stockSearch || "").trim().toLowerCase();
  
  const visibleStocks = query
    ? watchlistSource.filter((s) => {
        const name = (s.name || "").toLowerCase();
        const ticker = (s.ticker || "").toLowerCase();
        // Check if this watchlist stock maps to any of the search results from the live API search
        const matchedSearch = searchResults.find(r => (r.isin || "").toLowerCase() === ticker);
        const tradingSymbol = matchedSearch ? (matchedSearch.trading_symbol || "").toLowerCase() : "";
        return name.includes(query) || ticker.includes(query) || tradingSymbol.includes(query);
      })
    : watchlistSource;

  return (
    <div id="walkthrough-watchlist" style={{
      borderRight: isMobile ? "none" : `1px solid ${theme.border}`,
      borderBottom: isMobile ? `1px solid ${theme.border}` : "none",
      padding: 16, overflowY: "auto", background: theme.card,
      height: isMobile ? "calc(100vh - 60px)" : "auto",
      maxHeight: "none"
    }}>
      <div style={{ fontSize: 10, color: theme.text2, letterSpacing: 2, marginBottom: 12, paddingLeft: 4 }}>WATCHLIST & SEARCH</div>
      <div style={{ marginBottom: 14, position: "relative" }}>
        <input
          id="walkthrough-search"
          type="text" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
          placeholder="Search watchlist or type symbol to add..."
          style={{ 
            width: "100%", 
            background: themeMode === "light" ? "#ffffff" : theme.input, 
            border: `1px solid ${theme.border}`, 
            color: themeMode === "light" ? "#111827" : "#cde", 
            borderRadius: 8, 
            padding: "10px 32px 10px 12px", 
            fontSize: 12, 
            outline: "none",
            transition: "all 0.2s ease"
          }}
          onFocus={(e) => e.target.style.borderColor = themeMode === "light" ? "#10b981" : "#00e5a055"}
          onBlur={(e) => e.target.style.borderColor = theme.border}
        />
        {searchLoading && (
          <span style={{ 
            position: "absolute", 
            right: 12, 
            top: "50%", 
            transform: "translateY(-50%)", 
            fontSize: 10, 
            color: themeMode === "light" ? "#6b7280" : "#556677" 
          }}>
            ...
          </span>
        )}
      </div>

      {(stockError || stockNotice) && (
        <div style={{ 
          marginBottom: 12, 
          fontSize: 10, 
          color: stockError ? "#fca5a5" : "#7cfccf",
          background: stockError ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
          padding: "6px 10px",
          borderRadius: 6
        }}>
          {stockError || stockNotice}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Watchlist Section */}
        {visibleStocks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleStocks.map(s => (
              <StockCard key={s.ticker} ticker={s.ticker} themeMode={themeMode} name={s.name} meta={s} selected={selected === s.ticker}
                data={stockData[s.ticker]} onClick={() => {
                  setSelected(s.ticker);
                  if (activePage === "options") {
                    setOptionUnderlying(s.ticker);
                  } else {
                    setActivePage("stock");
                    setShowWatchlist(false);
                  }
                }} onRemove={() => removeWatchlistStock(s.ticker)} />
            ))}
          </div>
        )}

        {/* Non-watchlist Search Results (Add Options) */}
        {stockSearch.trim() !== "" && (() => {
          const watchlistIsins = new Set(watchlistSource.map(s => s.ticker));
          const nonWatchlistResults = searchResults.filter(r => !watchlistIsins.has(r.isin));
          
          if (nonWatchlistResults.length === 0) return null;

          return (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 9, color: theme.text2, letterSpacing: 1.5, paddingLeft: 4, fontWeight: 700, textTransform: "uppercase" }}>ADD TO WATCHLIST</div>
              {nonWatchlistResults.map((item) => (
                <div key={item.isin} style={{
                  background: themeMode === "light" ? "#ffffff" : "#09121c",
                  border: `1px dashed ${theme.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  boxShadow: themeMode === "light" ? "0 2px 8px rgba(0,0,0,0.03)" : "none"
                }}>
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.trading_symbol}
                    </div>
                    <div style={{ fontSize: 9, color: "#556677", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {item.name}
                    </div>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await addWatchlistStock(item.isin, item.trading_symbol || item.name);
                    }}
                    style={{
                      background: themeMode === "light" ? "#10b981" : "rgba(0, 229, 160, 0.15)",
                      color: themeMode === "light" ? "#ffffff" : "#00e5a0",
                      border: themeMode === "light" ? "none" : "1px solid rgba(0, 229, 160, 0.3)",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "opacity 0.2s"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = 0.9; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = 1; }}
                  >
                    + ADD
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Empty States */}
        {!visibleStocks.length && !searchResults.filter(r => !new Set(watchlistSource.map(s => s.ticker)).has(r.isin)).length && (
          <div style={{ color: "#556677", fontSize: 11, padding: "12px 4px", textAlign: "center" }}>
            {stockSearch.trim() ? "No stocks found." : "Your watchlist is empty."}
          </div>
        )}
      </div>
    </div>
  );
}
