import { useState } from "react";

export default function LoginView({ onLoginSuccess, API_BASE, themeMode, setThemeMode }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isDark = themeMode !== "light";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister 
        ? { email, password } 
        : { email, password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || "Authentication failed.");
      }

      setNotice(isRegister ? "Registration successful! Logging in..." : "Logged in successfully.");
      setTimeout(() => {
        onLoginSuccess(json.token, json.user, isRegister);
      }, 1000);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: isDark 
        ? "radial-gradient(circle at center, #0e1e2f 0%, #060e17 100%)"
        : "radial-gradient(circle at center, #f0f4f8 0%, #dbeafe 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      padding: "20px",
      transition: "background 0.3s ease"
    }}>
      <div style={{
        background: isDark ? "rgba(8, 16, 26, 0.85)" : "rgba(255, 255, 255, 0.85)",
        borderRadius: "16px",
        padding: "36px 40px",
        width: "100%",
        maxWidth: "420px",
        boxShadow: isDark ? "0 8px 32px rgba(0, 0, 0, 0.4)" : "0 8px 32px rgba(31, 38, 135, 0.08)",
        backdropFilter: "blur(8px)",
        border: isDark ? "1px solid rgba(20, 34, 52, 0.5)" : "1px solid rgba(255, 255, 255, 0.45)",
        textAlign: "center",
        position: "relative",
        transition: "all 0.3s ease"
      }}>
        {/* Theme Toggle */}
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <button
            type="button"
            onClick={() => setThemeMode(isDark ? "light" : "dark")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: isDark ? "#8899aa" : "#4b5563",
              fontSize: "18px",
              transition: "transform 0.2s ease",
              outline: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.15)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        </div>

        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 28, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: isDark ? "#0a1520" : "#ffffff", boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.05)", border: isDark ? "none" : "1px solid #e5e7eb" }}>
            <img src="/logo.png" alt="ALGOOEE" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: isDark ? "#fff" : "#111827", letterSpacing: -0.5 }}>Algooee</div>
            <div style={{ fontSize: 9, color: isDark ? "#00e5a0" : "#10b981", letterSpacing: 2, fontWeight: 600 }}>STOCK INTELLIGENCE</div>
          </div>
        </div>

        <h2 style={{ color: isDark ? "#fff" : "#111827", fontSize: 22, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
          {isRegister ? "Create Account" : "Sign In"}
        </h2>
        <p style={{ color: isDark ? "#778899" : "#4b5563", fontSize: 13, marginBottom: 24, marginTop: 0 }}>
          {isRegister ? "Register to start paper trading & prediction" : "Sign in to access your portfolio & watchlist"}
        </p>

        {error && (
          <div style={{
            background: isDark ? "#2a1218" : "#fef2f2",
            border: isDark ? "1px solid #ef444433" : "1px solid #fee2e2",
            borderRadius: "8px",
            color: isDark ? "#fca5a5" : "#ef4444",
            fontSize: "12px",
            padding: "10px 14px",
            marginBottom: "18px",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
            {error}
          </div>
        )}

        {notice && (
          <div style={{
            background: isDark ? "#0f2a24" : "#f0fdf4",
            border: isDark ? "1px solid #00e5a033" : "1px solid #dcfce7",
            borderRadius: "8px",
            color: isDark ? "#7cfccf" : "#16a34a",
            fontSize: "12px",
            padding: "10px 14px",
            marginBottom: "18px",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: isDark ? "#00e5a0" : "#16a34a", flexShrink: 0 }} />
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: isDark ? "#556a84" : "#4b5563", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>EMAIL ADDRESS</label>
            <input
              type="email"
              placeholder="e.g. trader@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{
                width: "100%",
                background: isDark ? "#050b12" : "#ffffff",
                border: isDark ? "1px solid #142234" : "1px solid #d1d5db",
                color: isDark ? "#cde" : "#111827",
                borderRadius: "8px",
                padding: "11px 14px",
                fontSize: "13px",
                outline: "none",
                transition: "all 0.2s ease"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = isDark ? "#00e5a055" : "#10b981";
                e.target.style.boxShadow = isDark ? "none" : "0 0 0 3px rgba(16, 185, 129, 0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = isDark ? "#142234" : "#d1d5db";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: isDark ? "#556a84" : "#4b5563", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>PASSWORD</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  background: isDark ? "#050b12" : "#ffffff",
                  border: isDark ? "1px solid #142234" : "1px solid #d1d5db",
                  color: isDark ? "#cde" : "#111827",
                  borderRadius: "8px",
                  padding: "11px 40px 11px 14px",
                  fontSize: "13px",
                  outline: "none",
                  transition: "all 0.2s ease"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = isDark ? "#00e5a055" : "#10b981";
                  e.target.style.boxShadow = isDark ? "none" : "0 0 0 3px rgba(16, 185, 129, 0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = isDark ? "#142234" : "#d1d5db";
                  e.target.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: isDark ? "#8899aa" : "#6b7280",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  outline: "none"
                }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {isRegister && (
            <div>
              <label style={{ display: "block", fontSize: 11, color: isDark ? "#556a84" : "#4b5563", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>CONFIRM PASSWORD</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    background: isDark ? "#050b12" : "#ffffff",
                    border: isDark ? "1px solid #142234" : "1px solid #d1d5db",
                    color: isDark ? "#cde" : "#111827",
                    borderRadius: "8px",
                    padding: "11px 40px 11px 14px",
                    fontSize: "13px",
                    outline: "none",
                    transition: "all 0.2s ease"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = isDark ? "#00e5a055" : "#10b981";
                    e.target.style.boxShadow = isDark ? "none" : "0 0 0 3px rgba(16, 185, 129, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = isDark ? "#142234" : "#d1d5db";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: isDark ? "#8899aa" : "#6b7280",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    outline: "none"
                  }}
                >
                  {showConfirmPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: isDark ? "#00e5a0" : "#10b981",
              color: isDark ? "#050b12" : "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s ease, transform 0.1s ease",
              marginTop: 10,
              boxShadow: isDark ? "0 0 10px rgba(0, 229, 160, 0.3)" : "0 4px 12px rgba(16, 185, 129, 0.2)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
            onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
          >
            {loading ? "PROCESSING..." : isRegister ? "REGISTER" : "LOGIN"}
          </button>
        </form>

        <div style={{ borderTop: isDark ? "1px solid #142234" : "1px solid #e5e7eb", margin: "24px 0 16px 0" }} />

        <button
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
            setNotice("");
            setShowPassword(false);
            setShowConfirmPassword(false);
          }}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            color: isDark ? "#00e5a0" : "#10b981",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            outline: "none"
          }}
        >
          {isRegister ? "Already have an account? Sign In" : "Don't have an account? Register"}
        </button>
      </div>
    </div>
  );
}
