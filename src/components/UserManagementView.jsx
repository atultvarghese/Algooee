import { useState, useEffect } from "react";
import { formatExactDateTime, formatPreciseRelativeTime } from "../utils/formatters";

export default function UserManagementView({ API_BASE, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // 'add' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  const getHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: getHeaders()
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Failed to fetch users");
      setUsers(json.users || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not retrieve user list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAdd = () => {
    setModalMode("add");
    setSelectedUser(null);
    setEmail("");
    setPassword("");
    setRole("user");
    setError("");
    setNotice("");
    setShowModal(true);
  };

  const handleOpenEdit = (user) => {
    setModalMode("edit");
    setSelectedUser(user);
    setEmail(user.email);
    setPassword(""); // Keep password empty unless changing it
    setRole(user.role);
    setError("");
    setNotice("");
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!email) {
      setError("Email address is required.");
      return;
    }

    if (modalMode === "add" && !password) {
      setError("Password is required.");
      return;
    }

    try {
      let res;
      if (modalMode === "add") {
        res = await fetch(`${API_BASE}/api/admin/users`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ email, password, role })
        });
      } else {
        const payload = { email, role };
        if (password) {
          payload.password = password;
        }
        res = await fetch(`${API_BASE}/api/admin/users/${selectedUser.id}`, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Operation failed.");

      setNotice(modalMode === "add" ? "User created successfully." : "User updated successfully.");
      setShowModal(false);
      fetchUsers();
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to save user.");
    }
  };

  const handleDelete = async (userId) => {
    if (userId === currentUser.id) {
      alert("You cannot delete your own logged-in user account.");
      return;
    }
    const ok = window.confirm("Are you sure you want to delete this user? All their trading data, holdings, and watchlists will be permanently removed.");
    if (!ok) return;

    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Failed to delete user");

      setNotice("User deleted successfully.");
      fetchUsers();
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to delete user.");
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
      {/* Header section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, margin: 0, color: "#fff" }}>User Management</h1>
          <span style={{ fontSize: 12, color: "#667788" }}>Manage registered system accounts and access credentials</span>
        </div>
        <button
          onClick={handleOpenAdd}
          style={{
            background: "#00e5a022",
            color: "#00e5a0",
            border: "1px solid #00e5a055",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#00e5a0"; e.currentTarget.style.color = "#050b12"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#00e5a022"; e.currentTarget.style.color = "#00e5a0"; }}
        >
          + ADD USER
        </button>
      </div>

      {/* Notice Board */}
      {(error || notice) && (
        <div style={{
          borderRadius: 10, padding: "12px 16px",
          border: `1px solid ${error ? "#f8717133" : "#00e5a033"}`,
          background: error ? "#1e0b0e" : "#051612",
          color: error ? "#fca5a5" : "#7cfccf",
          fontSize: 12, display: "flex", alignItems: "center", gap: 10
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: error ? "#ef4444" : "#10b981" }} />
          {error || notice}
        </div>
      )}

      {/* Users table */}
      <div style={{
        background: "#08101a",
        padding: "20px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)"
      }}>
        <div style={{ overflowX: "auto" }}>
          {loading && users.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: 16 }}>
              <div style={{
                width: 36,
                height: 36,
                border: "3px solid rgba(0, 229, 160, 0.15)",
                borderTop: "3px solid #00e5a0",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }} />
              <div style={{ color: "#8899aa", fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>
                Loading users...
              </div>
            </div>
          ) : users.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#0c1827", color: "#556a84", fontWeight: 700, textTransform: "uppercase", fontSize: "10px", letterSpacing: 1 }}>
                  <th style={{ padding: "12px 14px", borderBottom: "1px solid #142234" }}>ID</th>
                  <th style={{ padding: "12px 14px", borderBottom: "1px solid #142234" }}>Email / Username</th>
                  <th style={{ padding: "12px 14px", borderBottom: "1px solid #142234" }}>Role</th>
                  <th style={{ padding: "12px 14px", borderBottom: "1px solid #142234" }}>Created Date</th>
                  <th style={{ padding: "12px 14px", borderBottom: "1px solid #142234", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #0e1a29", color: "#cde" }}>
                    <td style={{ padding: "14px", color: "#8899aa", fontFamily: "'Space Mono', monospace" }}>{u.id}</td>
                    <td style={{ padding: "14px", color: "#fff", fontWeight: 600 }}>
                      {u.email}
                      {u.id === currentUser.id && (
                        <span style={{ marginLeft: 8, fontSize: 9, background: "#00e5a022", color: "#00e5a0", padding: "2px 6px", borderRadius: 4 }}>
                          YOU
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        background: u.role === "admin" ? "#facc1515" : "#00e5a015",
                        color: u.role === "admin" ? "#facc15" : "#00e5a0",
                        padding: "4px 8px", borderRadius: 6
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <div style={{ color: "#fff", fontFamily: "'Space Mono', monospace" }}>{formatExactDateTime(u.created_at)}</div>
                      <div style={{ fontSize: 10, color: "#8899aa", marginTop: 2 }}>{formatPreciseRelativeTime(u.created_at)}</div>
                    </td>
                    <td style={{ padding: "14px", display: "flex", gap: "8px", justifyContent: "center" }}>
                      <button
                        onClick={() => handleOpenEdit(u)}
                        style={{
                          background: "#0f2030", color: "#60a5fa",
                          border: "1px solid #3b82f644", borderRadius: 6,
                          padding: "6px 12px", fontSize: 11, fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={u.id === currentUser.id}
                        style={{
                          background: "#2a1218", color: "#f87171",
                          border: "1px solid #f8717144", borderRadius: 6,
                          padding: "6px 12px", fontSize: 11, fontWeight: 600,
                          cursor: u.id === currentUser.id ? "not-allowed" : "pointer",
                          opacity: u.id === currentUser.id ? 0.4 : 1
                        }}
                      >
                        DELETE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "40px", color: "#556a84" }}>No user accounts found.</div>
          )}
        </div>
      </div>

      {/* Modal dialog */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(3, 7, 12, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#08101a",
            borderRadius: 16, padding: "30px", width: "100%", maxWidth: "400px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
          }}>
            <h3 style={{ color: "#fff", margin: "0 0 8px 0", fontSize: 18 }}>
              {modalMode === "add" ? "Add New System User" : "Edit User Account"}
            </h3>
            <p style={{ color: "#778899", fontSize: 12, margin: "0 0 20px 0" }}>
              {modalMode === "add" 
                ? "Create a new user account with login credentials." 
                : "Update login details or access controls for this account."}
            </p>

            {/* Error inside modal */}
            {error && (
              <div style={{
                background: "#2a1218", border: "1px solid #ef444433", borderRadius: 8,
                color: "#fca5a5", fontSize: 11, padding: "8px 12px", marginBottom: 16
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 5, fontWeight: 600 }}>EMAIL ADDRESS</label>
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{
                    width: "100%", background: "#050b12", border: "1px solid #142234",
                    color: "#cde", borderRadius: 8, padding: "9px 12px", fontSize: 12, outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 5, fontWeight: 600 }}>
                  {modalMode === "edit" ? "PASSWORD (LEAVE BLANK TO KEEP UNCHANGED)" : "PASSWORD"}
                </label>
                <input
                  type="password" required={modalMode === "add"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%", background: "#050b12", border: "1px solid #142234",
                    color: "#cde", borderRadius: 8, padding: "9px 12px", fontSize: 12, outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, color: "#556a84", marginBottom: 5, fontWeight: 600 }}>ACCESS ROLE</label>
                <select
                  value={role} onChange={(e) => setRole(e.target.value)}
                  disabled={selectedUser?.id === currentUser.id}
                  style={{
                    width: "100%", background: "#050b12", border: "1px solid #142234",
                    color: "#cde", borderRadius: 8, padding: "9px 12px", fontSize: 12, outline: "none"
                  }}
                >
                  <option value="user">User (Standard Trader)</option>
                  <option value="admin">Admin (System Administrator)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  type="button" onClick={() => setShowModal(false)}
                  style={{
                    flex: 1, background: "none", border: "1px solid #142234",
                    color: "#778899", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 600, cursor: "pointer"
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1, background: "#00e5a0", border: "none",
                    color: "#050b12", borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700, cursor: "pointer"
                  }}
                >
                  SAVE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
