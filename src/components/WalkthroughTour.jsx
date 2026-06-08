import { useState, useEffect } from "react";

export default function WalkthroughTour({ themeMode, activePage, setActivePage, isMobile, showWatchlist, setShowWatchlist, adminMobileTab, setAdminMobileTab, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);

  const isDark = themeMode !== "light";

  const steps = [
    {
      targetId: "",
      title: "Welcome to Algooee! 🚀",
      content: "Algooee is an intelligent algorithmic and paper trading platform. Let's take a quick 1-minute tour to walk you through how it works.",
      page: "stock"
    },
    {
      targetId: "walkthrough-nav-tabs",
      title: "Navigation Hub",
      content: "Switch between Stock Page (analysis & charts), Options Chain, and your Admin Dashboard/Ledger here.",
      page: "stock"
    },
    {
      targetId: "walkthrough-watchlist",
      title: "Stock Watchlist",
      content: "Click any stock ticker in this list to analyze its metrics, historical data, and AI-predicted signals.",
      page: "stock"
    },
    {
      targetId: "walkthrough-search",
      title: "Search & Add Stocks",
      content: "Type any company name, ticker symbol, or ISIN to search and select custom NSE stocks.",
      page: "stock"
    },
    {
      targetId: "walkthrough-chart",
      title: "AI Predictions Chart",
      content: "See actual closing prices over the past 10 days plotted alongside AI forecasts for the next trading day.",
      page: "stock"
    },
    {
      targetId: "walkthrough-papertrade",
      title: "Execute Paper Trades",
      content: "Enter quantity and custom execute price to place virtual BUY or SELL orders using simulated funds.",
      page: "stock"
    },
    {
      targetId: "walkthrough-nav-options",
      title: "Options Chain Hub",
      content: "Now let's switch to the Options tab to view complete Call and Put contract chains.",
      page: "options"
    },
    {
      targetId: "walkthrough-options-grid",
      title: "Call & Put Contract Grid",
      content: "View live strike prices, expiry dates, and contract LTPs. Click 'BUY' or 'SELL' on any option row to trade it.",
      page: "options"
    },
    {
      targetId: "walkthrough-nav-admin",
      title: "Admin Portfolio Page",
      content: "Let's switch to the Admin page to check your account balance, metrics, and open positions.",
      page: "admin"
    },
    {
      targetId: "walkthrough-admin-metrics",
      title: "Portfolio Balance & P/L",
      content: "Track your overall portfolio health: Cash Balance, Capital Invested, current Market Value, and total P/L.",
      page: "admin"
    },
    {
      targetId: "walkthrough-admin-holdings",
      title: "Active Holdings Ledger",
      content: "Manage open stock/option positions. Quickly buy more or sell out directly from this table.",
      page: "admin"
    },
    {
      targetId: "walkthrough-admin-controls",
      title: "Account Controls",
      content: "Simulate depositing mock cash (Dummy virtual money) to add funds or completely reset your virtual account ledger to start over.",
      page: "admin"
    },
    {
      targetId: "walkthrough-tour-restart",
      title: "All Set! 🎉",
      content: "You're ready to start using Algooee's Stock Intelligence! Restart this tour anytime from this button in the header.",
      page: "stock"
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose(true);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  useEffect(() => {
    const step = steps[currentStep];

    // Automatically navigate to correct tab
    if (step.page && step.page !== activePage) {
      setActivePage(step.page);
    }

    // Automatically handle mobile watchlist overlay toggle
    if (isMobile && step.page === "stock") {
      const needsWatchlist = step.targetId === "walkthrough-watchlist" || step.targetId === "walkthrough-search" || step.targetId === "walkthrough-tour-restart";
      if (needsWatchlist && !showWatchlist) {
        setShowWatchlist(true);
      } else if (!needsWatchlist && showWatchlist) {
        setShowWatchlist(false);
      }
    }

    // Automatically handle mobile admin page sub-tabs
    if (isMobile && step.page === "admin") {
      if (step.targetId === "walkthrough-admin-controls") {
        if (adminMobileTab !== "controls") {
          setAdminMobileTab("controls");
        }
      } else if (step.targetId === "walkthrough-admin-metrics" || step.targetId === "walkthrough-admin-holdings") {
        if (adminMobileTab !== "holdings") {
          setAdminMobileTab("holdings");
        }
      }
    }

    let timer;
    const updatePosition = () => {
      if (!step.targetId) {
        setSpotlightRect(null);
        return;
      }

      const element = document.getElementById(step.targetId);
      if (element) {
        const rect = element.getBoundingClientRect();
        
        // Scroll element into view if it isn't fully visible
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!isVisible) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        // Delay slightly for smooth scroll, then fetch final viewport positions
        setTimeout(() => {
          const finalRect = element.getBoundingClientRect();
          setSpotlightRect({
            x: finalRect.left,
            y: finalRect.top,
            width: finalRect.width,
            height: finalRect.height
          });
        }, 100);
      } else {
        // Polling retry in case of tab navigation or mount latency
        timer = setTimeout(updatePosition, 100);
      }
    };

    // Delay slightly to account for page switching / layouts
    timer = setTimeout(updatePosition, 150);

    const handleSync = () => {
      if (!step.targetId) return;
      const element = document.getElementById(step.targetId);
      if (element) {
        const rect = element.getBoundingClientRect();
        setSpotlightRect({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        });
      }
    };

    window.addEventListener("resize", handleSync);
    window.addEventListener("scroll", handleSync);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleSync);
      window.removeEventListener("scroll", handleSync);
    };
  }, [currentStep, activePage, showWatchlist, adminMobileTab, isMobile]);

  const step = steps[currentStep];

  // Tooltip Placement Math
  const cardWidth = 340;
  const cardHeight = 180;
  let cardStyle = {
    position: "fixed",
    zIndex: 10001,
    background: isDark ? "rgba(10, 22, 38, 0.95)" : "rgba(255, 255, 255, 0.95)",
    border: isDark ? "1px solid rgba(0, 229, 160, 0.35)" : "1px solid rgba(16, 185, 129, 0.35)",
    boxShadow: isDark ? "0 10px 30px rgba(0, 229, 160, 0.15)" : "0 10px 30px rgba(16, 185, 129, 0.12)",
    borderRadius: "14px",
    padding: "20px",
    width: `${cardWidth}px`,
    maxWidth: "90vw",
    backdropFilter: "blur(10px)",
    color: isDark ? "#cde" : "#1f2937",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    flexDirection: "column",
    gap: 12
  };

  // Placed static at the bottom center of the screen for all views (mobile and web)
  cardStyle.bottom = "24px";
  cardStyle.left = "50%";
  cardStyle.transform = "translateX(-50%)";

  return (
    <>
      {/* Spotlight Canvas Mask */}
      <svg style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 10000,
        pointerEvents: "none"
      }}>
        <defs>
          <mask id="spotlight-mask">
            <rect width="100vw" height="100vh" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.x - 8}
                y={spotlightRect.y - 8}
                width={spotlightRect.width + 16}
                height={spotlightRect.height + 16}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100vw"
          height="100vh"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#spotlight-mask)"
          style={{ pointerEvents: "auto" }}
        />
      </svg>

      {/* Walkthrough Pop-up card */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? "#fff" : "#111827" }}>
            {step.title}
          </h4>
          <span style={{ fontSize: 10, color: isDark ? "#8899aa" : "#6b7280", fontWeight: 600 }}>
            {currentStep + 1} / {steps.length}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: isDark ? "#9bb0c4" : "#4b5563" }}>
          {step.content}
        </p>

        {/* Step Indicator Progress Dot Line */}
        <div style={{ display: "flex", gap: 4, margin: "4px 0" }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: idx === currentStep 
                  ? (isDark ? "#00e5a0" : "#10b981") 
                  : idx < currentStep 
                    ? (isDark ? "rgba(0,229,160,0.3)" : "rgba(16,185,129,0.3)") 
                    : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"),
                transition: "all 0.2s ease"
              }}
            />
          ))}
        </div>

        {/* Buttons Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button
            onClick={() => onClose(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: isDark ? "#8899aa" : "#6b7280",
              fontWeight: 600,
              padding: "4px 8px",
              outline: "none"
            }}
          >
            Skip Tour
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                style={{
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                  border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 6,
                  color: isDark ? "#cde" : "#374151",
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                Back
              </button>
            )}

            <button
              onClick={handleNext}
              style={{
                background: isDark ? "#00e5a0" : "#10b981",
                border: "none",
                borderRadius: 6,
                color: isDark ? "#050b12" : "#ffffff",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: isDark ? "0 2px 8px rgba(0,229,160,0.2)" : "0 2px 8px rgba(16,185,129,0.2)",
                outline: "none",
                transition: "opacity 0.2s ease"
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
            >
              {currentStep === steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
