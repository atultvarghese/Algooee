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
      borderRight: isMobile ? "none" : "1px solid var(--theme-border)",
      borderBottom: isMobile ? "1px solid var(--theme-border)" : "none",
      padding: 16, overflowY: "auto", background: "var(--theme-card)",
      height: isMobile ? "calc(100vh - 60px)" : "auto",
      maxHeight: "none"
    }}>
      <div style={{ fontSize: 10, color: "var(--theme-text2)", letterSpacing: 2, marginBottom: 12, paddingLeft: 4 }}>WATCHLIST & SEARCH</div>
      <div style={{ marginBottom: 14, position: "relative" }}>
        <input
          id="walkthrough-search"
          type="text" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
          placeholder="Search watchlist or type symbol to add..."
          className="theme-input search-input"
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
                  setOptionUnderlying(s.ticker);
                  if (activePage !== "options") {
                    setActivePage("stock");
                  }
                  if (isMobile) {
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
              <div style={{ fontSize: 9, color: "var(--theme-text2)", letterSpacing: 1.5, paddingLeft: 4, fontWeight: 700, textTransform: "uppercase" }}>ADD TO WATCHLIST</div>
              {nonWatchlistResults.map((item) => (
                <div key={item.isin} className="add-watchlist-item">
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <div className="mono-font" style={{ fontSize: 13, fontWeight: 700, color: "var(--theme-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.trading_symbol}
                    </div>
                    <div style={{ fontSize: 9, color: "#556677", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {item.name}
                    </div>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const success = await addWatchlistStock(item.isin, item.trading_symbol || item.name);
                      if (success) {
                        setStockSearch("");
                        if (isMobile) {
                          setShowWatchlist(true);
                        }
                      }
                    }}
                    className="btn-add-watchlist"
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
