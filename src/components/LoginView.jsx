import { useState } from "react";

export default function LoginView({ onLoginSuccess, API_BASE }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

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
        onLoginSuccess(json.token, json.user);
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
      background: "radial-gradient(circle at center, #0e1e2f 0%, #060e17 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      padding: "20px"
    }}>
      <div style={{
        background: "rgba(8, 16, 26, 0.85)",
        borderRadius: "16px",
        padding: "36px 40px",
        width: "100%",
        maxWidth: "420px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(8px)",
        textAlign: "center"
      }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 28, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#0a1520" }}>
            <img src="/logo.png" alt="ALGOOEE" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>Algooee</div>
            <div style={{ fontSize: 9, color: "#00e5a0", letterSpacing: 2, fontWeight: 600 }}>STOCK INTELLIGENCE</div>
          </div>
        </div>

        <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
          {isRegister ? "Create Account" : "Sign In"}
        </h2>
        <p style={{ color: "#778899", fontSize: 13, marginBottom: 24, marginTop: 0 }}>
          {isRegister ? "Register to start paper trading & prediction" : "Sign in to access your portfolio & watchlist"}
        </p>

        {error && (
          <div style={{
            background: "#2a1218",
            border: "1px solid #ef444433",
            borderRadius: "8px",
            color: "#fca5a5",
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
            background: "#0f2a24",
            border: "1px solid #00e5a033",
            borderRadius: "8px",
            color: "#7cfccf",
            fontSize: "12px",
            padding: "10px 14px",
            marginBottom: "18px",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5a0", flexShrink: 0 }} />
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#556a84", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>EMAIL ADDRESS</label>
            <input
              type="email"
              placeholder="e.g. trader@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{
                width: "100%",
                background: "#050b12",
                border: "1px solid #142234",
                color: "#cde",
                borderRadius: "8px",
                padding: "11px 14px",
                fontSize: "13px",
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#00e5a055"}
              onBlur={(e) => e.target.style.borderColor = "#142234"}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: "#556a84", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>PASSWORD</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={{
                width: "100%",
                background: "#050b12",
                border: "1px solid #142234",
                color: "#cde",
                borderRadius: "8px",
                padding: "11px 14px",
                fontSize: "13px",
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#00e5a055"}
              onBlur={(e) => e.target.style.borderColor = "#142234"}
            />
          </div>

          {isRegister && (
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#556a84", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>CONFIRM PASSWORD</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  background: "#050b12",
                  border: "1px solid #142234",
                  color: "#cde",
                  borderRadius: "8px",
                  padding: "11px 14px",
                  fontSize: "13px",
                  outline: "none",
                  transition: "border-color 0.2s ease"
                }}
                onFocus={(e) => e.target.style.borderColor = "#00e5a055"}
                onBlur={(e) => e.target.style.borderColor = "#142234"}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "#00e5a0",
              color: "#050b12",
              border: "none",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s ease",
              marginTop: 10,
              boxShadow: "0 0 10px rgba(0, 229, 160, 0.3)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
            onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
          >
            {loading ? "PROCESSING..." : isRegister ? "REGISTER" : "LOGIN"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid #142234", margin: "24px 0 16px 0" }} />

        <button
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
            setNotice("");
          }}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            color: "#00e5a0",
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
