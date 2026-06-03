import hashlib
import os
import secrets
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional

DEFAULT_WATCHLIST_STOCKS = [
    {"name": "Trident", "isin": "INE064C01022"},
    {"name": "NIFTYBEES", "isin": "INF204KB14I2"},
    {"name": "Bharti Airtel", "isin": "INE397D01024"},
    {"name": "TCS", "isin": "INE467B01029"},
]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    )
    return f"{salt}:{hash_bytes.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hash_hex = stored_hash.split(":")
        hash_bytes = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100000
        )
        return hash_bytes.hex() == hash_hex
    except Exception:
        return False


@dataclass
class PaperOrderResult:
    isin: str
    side: str
    amount: float
    quantity: float
    price: float
    gross_value: float
    realized_pnl: float
    cash_balance: float


class PaperTradeStore:
    """Lightweight SQLite-backed multi-user paper trading storage."""

    def __init__(self, db_path: str = "paper_trade.db"):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            # 1. Create users table if not exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    created_at TEXT NOT NULL
                )
                """)

            # 2. Create sessions table if not exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """)

            # 3. Create default admin user if no users exist
            admin_row = conn.execute("SELECT id FROM users WHERE id = 1").fetchone()
            if not admin_row:
                default_pwd_hash = hash_password("admin123")
                conn.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at) "
                    "VALUES (1, 'admin@algooee.local', ?, 'admin', datetime('now'))",
                    (default_pwd_hash,)
                )

            # 4. Check and migrate wallet table
            wallet_cols = [r["name"] for r in conn.execute("PRAGMA table_info(wallet)").fetchall()]
            if wallet_cols and "user_id" not in wallet_cols:
                # Migration: wallet has old schema (id check, no user_id).
                old_row = conn.execute("SELECT cash_balance FROM wallet WHERE id = 1").fetchone()
                old_balance = float(old_row["cash_balance"]) if old_row else 0.0

                conn.execute("DROP TABLE IF EXISTS wallet")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS wallet (
                        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                        cash_balance REAL NOT NULL DEFAULT 0,
                        updated_at TEXT NOT NULL
                    )
                    """)
                conn.execute(
                    "INSERT INTO wallet (user_id, cash_balance, updated_at) VALUES (1, ?, datetime('now'))",
                    (old_balance,)
                )
            elif not wallet_cols:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS wallet (
                        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                        cash_balance REAL NOT NULL DEFAULT 0,
                        updated_at TEXT NOT NULL
                    )
                    """)
                conn.execute(
                    "INSERT OR IGNORE INTO wallet (user_id, cash_balance, updated_at) VALUES (1, 0.0, datetime('now'))"
                )

            # 5. Check and migrate holdings, trades, wallet_ledger
            for tbl in ["holdings", "trades", "wallet_ledger"]:
                cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
                if cols and "user_id" not in cols:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN user_id INTEGER DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE")
                elif not cols:
                    if tbl == "holdings":
                        conn.execute("""
                            CREATE TABLE IF NOT EXISTS holdings (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                isin TEXT NOT NULL,
                                quantity REAL NOT NULL,
                                price REAL NOT NULL,
                                updated_at TEXT NOT NULL
                            )
                            """)
                    elif tbl == "trades":
                        conn.execute("""
                            CREATE TABLE IF NOT EXISTS trades (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                isin TEXT NOT NULL,
                                side TEXT NOT NULL,
                                amount REAL NOT NULL,
                                quantity REAL NOT NULL,
                                price REAL NOT NULL,
                                gross_value REAL NOT NULL,
                                realized_pnl REAL NOT NULL DEFAULT 0,
                                created_at TEXT NOT NULL
                            )
                            """)
                    elif tbl == "wallet_ledger":
                        conn.execute("""
                            CREATE TABLE IF NOT EXISTS wallet_ledger (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                kind TEXT NOT NULL,
                                amount REAL NOT NULL,
                                note TEXT,
                                created_at TEXT NOT NULL
                            )
                            """)

            # 6. Check and migrate watchlist_stocks
            watchlist_cols = [r["name"] for r in conn.execute("PRAGMA table_info(watchlist_stocks)").fetchall()]
            if watchlist_cols and "user_id" not in watchlist_cols:
                conn.execute("ALTER TABLE watchlist_stocks RENAME TO watchlist_stocks_old")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS watchlist_stocks (
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        isin TEXT NOT NULL,
                        name TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (user_id, isin)
                    )
                    """)
                conn.execute("""
                    INSERT OR IGNORE INTO watchlist_stocks (user_id, isin, name, created_at)
                    SELECT 1, isin, name, created_at FROM watchlist_stocks_old
                    """)
                conn.execute("DROP TABLE watchlist_stocks_old")
            elif not watchlist_cols:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS watchlist_stocks (
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        isin TEXT NOT NULL,
                        name TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (user_id, isin)
                    )
                    """)
                for row in DEFAULT_WATCHLIST_STOCKS:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO watchlist_stocks (user_id, isin, name, created_at)
                        VALUES (1, ?, ?, datetime('now'))
                        """,
                        (row["isin"], row["name"]),
                    )

            # 7. Create instrument_metadata
            conn.execute("""
                CREATE TABLE IF NOT EXISTS instrument_metadata (
                    isin TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    expiry TEXT,
                    created_at TEXT NOT NULL
                )
                """)
            conn.commit()

    # User Management Database Operations
    def create_user(self, email: str, password_raw: str, role: str = "user") -> int:
        email_norm = email.strip().lower()
        if not email_norm:
            raise ValueError("Email cannot be empty.")
        if "@" not in email_norm:
            raise ValueError("Invalid email format.")
        password_hash = hash_password(password_raw)
        with self._lock:
            with self._connect() as conn:
                existing = conn.execute("SELECT id FROM users WHERE email = ?", (email_norm,)).fetchone()
                if existing:
                    raise ValueError("User with this email already exists.")
                cursor = conn.execute(
                    "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, datetime('now'))",
                    (email_norm, password_hash, role)
                )
                user_id = cursor.lastrowid
                conn.execute(
                    "INSERT INTO wallet (user_id, cash_balance, updated_at) VALUES (?, 0.0, datetime('now'))",
                    (user_id,)
                )
                # Seed default stocks for the user watchlist
                for row in DEFAULT_WATCHLIST_STOCKS:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO watchlist_stocks (user_id, isin, name, created_at)
                        VALUES (?, ?, ?, datetime('now'))
                        """,
                        (user_id, row["isin"], row["name"]),
                    )
                conn.commit()
                return user_id

    def get_user_by_email(self, email: str) -> Optional[Dict]:
        email_norm = email.strip().lower()
        with self._connect() as conn:
            row = conn.execute("SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?", (email_norm,)).fetchone()
            return dict(row) if row else None

    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        with self._connect() as conn:
            row = conn.execute("SELECT id, email, role, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
            return dict(row) if row else None

    def list_users(self) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT id, email, role, created_at FROM users ORDER BY id ASC").fetchall()
            return [dict(row) for row in rows]

    def update_user(self, user_id: int, email: Optional[str] = None, password_raw: Optional[str] = None, role: Optional[str] = None) -> None:
        with self._lock:
            with self._connect() as conn:
                existing = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
                if not existing:
                    raise ValueError("User not found.")
                
                updates = []
                params = []
                if email is not None:
                    email_norm = email.strip().lower()
                    if not email_norm or "@" not in email_norm:
                        raise ValueError("Invalid email format.")
                    dup = conn.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email_norm, user_id)).fetchone()
                    if dup:
                        raise ValueError("Email already in use.")
                    updates.append("email = ?")
                    params.append(email_norm)
                
                if password_raw is not None:
                    pw_raw_strip = password_raw.strip()
                    if not pw_raw_strip:
                        raise ValueError("Password cannot be empty.")
                    updates.append("password_hash = ?")
                    params.append(hash_password(pw_raw_strip))
                
                if role is not None:
                    role_norm = role.strip().lower()
                    if role_norm not in {"user", "admin"}:
                        raise ValueError("Invalid role. Must be 'user' or 'admin'.")
                    updates.append("role = ?")
                    params.append(role_norm)
                
                if updates:
                    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
                    params.append(user_id)
                    conn.execute(query, params)
                    conn.commit()

    def delete_user(self, user_id: int) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
                conn.commit()

    def create_session(self, user_id: int) -> str:
        token = secrets.token_hex(32)
        created_at = datetime.utcnow().isoformat()
        expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO sessions (token, user_id, created_at, expires_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (token, user_id, created_at, expires_at)
                )
                conn.commit()
        return token

    def get_user_by_token(self, token: str) -> Optional[Dict]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.email, u.role, u.created_at
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at > ?
                """,
                (token, datetime.utcnow().isoformat())
            ).fetchone()
            return dict(row) if row else None

    def delete_session(self, token: str) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()

    # User Scoped Paper Trading Operations
    def get_cash_balance(self, user_id: int) -> float:
        with self._connect() as conn:
            row = conn.execute("SELECT cash_balance FROM wallet WHERE user_id = ?", (user_id,)).fetchone()
            return float(row["cash_balance"] if row else 0.0)

    def get_total_funded(self, user_id: int) -> float:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_ledger"
                " WHERE user_id = ? AND kind = 'FUND'",
                (user_id,)
            ).fetchone()
            return float(row["total"] if row else 0.0)

    def add_funds(self, user_id: int, amount: float, note: Optional[str] = None) -> float:
        if amount <= 0:
            raise ValueError("Funding amount must be greater than zero.")

        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT cash_balance FROM wallet WHERE user_id = ?", (user_id,)).fetchone()
                current = float(row["cash_balance"] if row else 0.0)
                new_balance = current + float(amount)

                conn.execute(
                    "UPDATE wallet SET cash_balance = ?, updated_at = datetime('now') WHERE user_id = ?",
                    (new_balance, user_id),
                )
                conn.execute(
                    """
                    INSERT INTO wallet_ledger (user_id, kind, amount, note, created_at)
                    VALUES (?, 'FUND', ?, ?, datetime('now'))
                    """,
                    (user_id, float(amount), note or "Admin funding"),
                )
                conn.commit()
                return new_balance

    def list_ledger(self, user_id: int, limit: int = 50) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, kind, amount, note, created_at
                FROM wallet_ledger
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_id, max(1, int(limit))),
            ).fetchall()
            return [dict(row) for row in rows]

    def list_trades(self, user_id: int, limit: int = 100) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, isin, side, amount, quantity, price, gross_value, realized_pnl,
                created_at FROM trades
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_id, max(1, int(limit))),
            ).fetchall()
            return [dict(row) for row in rows]

    def list_holdings(self, user_id: int) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute("""
                SELECT id, isin, quantity, price AS avg_price, updated_at
                FROM holdings
                WHERE user_id = ?
                ORDER BY updated_at ASC
                """, (user_id,)).fetchall()
            return [dict(row) for row in rows]

    def list_stocks(self, user_id: int, query: Optional[str] = None, limit: int = 200) -> List[Dict]:
        with self._connect() as conn:
            q = (query or "").strip()
            if q:
                pattern = f"%{q}%"
                rows = conn.execute(
                    """
                    SELECT isin, name, created_at
                    FROM watchlist_stocks
                    WHERE user_id = ? AND (isin LIKE ? OR name LIKE ?)
                    ORDER BY name ASC
                    LIMIT ?
                    """,
                    (user_id, pattern, pattern, max(1, int(limit))),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT isin, name, created_at
                    FROM watchlist_stocks
                    WHERE user_id = ?
                    ORDER BY name ASC
                    LIMIT ?
                    """,
                    (user_id, max(1, int(limit))),
                ).fetchall()
            return [dict(row) for row in rows]

    def add_stock(self, user_id: int, isin: str, name: str) -> Dict:
        normalized_isin = (isin or "").strip().upper()
        normalized_name = (name or "").strip()
        if not normalized_isin:
            raise ValueError("ISIN is required.")
        if not normalized_name:
            raise ValueError("Stock name is required.")

        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO watchlist_stocks (user_id, isin, name, created_at)
                    VALUES (?, ?, ?, datetime('now'))
                    ON CONFLICT(user_id, isin) DO UPDATE SET
                        name = excluded.name
                    """,
                    (user_id, normalized_isin, normalized_name),
                )
                conn.commit()
        return {"isin": normalized_isin, "name": normalized_name}

    def remove_stock(self, user_id: int, isin: str) -> None:
        normalized_isin = (isin or "").strip().upper()
        if not normalized_isin:
            raise ValueError("ISIN is required.")

        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM watchlist_stocks WHERE user_id = ? AND isin = ?", (user_id, normalized_isin))
                conn.commit()

    def get_realized_pnl(self, user_id: int) -> float:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(realized_pnl), 0) AS total FROM trades WHERE user_id = ? AND side = 'sell'",
                (user_id,)
            ).fetchone()
            return float(row["total"] if row else 0.0)

    def place_order(
        self, user_id: int, isin: str, side: str, amount: float, price: float
    ) -> PaperOrderResult:
        side_normalized = (side or "").strip().lower()
        if side_normalized not in {"buy", "sell"}:
            raise ValueError("Side must be 'buy' or 'sell'.")
        if amount <= 0:
            raise ValueError("Order amount must be greater than zero.")
        if price <= 0:
            raise ValueError("Execution price must be greater than zero.")

        with self._lock:
            with self._connect() as conn:
                wallet_row = conn.execute(
                    "SELECT cash_balance FROM wallet WHERE user_id = ?",
                    (user_id,)
                ).fetchone()
                cash_balance = float(wallet_row["cash_balance"] if wallet_row else 0.0)

                # Fetch all individual holdings for this ISIN, sorted oldest first
                holding_rows = conn.execute(
                    "SELECT id, quantity, price FROM holdings WHERE user_id = ? AND isin = ? ORDER BY id ASC",
                    (user_id, isin),
                ).fetchall()
                total_qty = sum(float(row["quantity"]) for row in holding_rows)

                quantity = float(amount) / float(price)
                gross_value = float(quantity * price)
                realized_pnl = 0.0

                if side_normalized == "buy":
                    if cash_balance + 1e-9 < gross_value:
                        raise ValueError("Insufficient cash balance for this buy order.")
                    new_cash = cash_balance - gross_value

                    # Insert a new individual holding row
                    conn.execute(
                        """
                        INSERT INTO holdings (user_id, isin, quantity, price, updated_at)
                        VALUES (?, ?, ?, ?, datetime('now'))
                        """,
                        (user_id, isin, quantity, float(price)),
                    )
                else:
                    if total_qty <= 0:
                        raise ValueError("No holdings available to sell.")
                    if quantity > total_qty + 1e-9:
                        raise ValueError("Sell amount exceeds available holdings value.")

                    new_cash = cash_balance + gross_value

                    # FIFO inventory reduction
                    remaining_sell = quantity
                    for h_row in holding_rows:
                        h_id = h_row["id"]
                        h_qty = float(h_row["quantity"])
                        h_price = float(h_row["price"])

                        if h_qty <= remaining_sell + 1e-9:
                            realized_pnl += (float(price) - h_price) * h_qty
                            remaining_sell -= h_qty
                            conn.execute("DELETE FROM holdings WHERE id = ?", (h_id,))
                        else:
                            realized_pnl += (float(price) - h_price) * remaining_sell
                            new_h_qty = h_qty - remaining_sell
                            conn.execute(
                                "UPDATE holdings SET quantity = ? WHERE id = ?",
                                (new_h_qty, h_id),
                            )
                            remaining_sell = 0.0
                            break

                conn.execute(
                    "UPDATE wallet SET cash_balance = ?, updated_at = datetime('now') WHERE user_id = ?",
                    (new_cash, user_id),
                )

                conn.execute(
                    """
                    INSERT INTO trades (
                        user_id, isin, side, amount, quantity, price, gross_value,
                        realized_pnl, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    """,
                    (
                        user_id,
                        isin,
                        side_normalized,
                        float(amount),
                        quantity,
                        float(price),
                        gross_value,
                        realized_pnl,
                    ),
                )

                ledger_amount = -gross_value if side_normalized == "buy" else gross_value
                ledger_note = f"{side_normalized.upper()} {isin}"
                conn.execute(
                    """
                    INSERT INTO wallet_ledger (user_id, kind, amount, note, created_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                    """,
                    (user_id, side_normalized.upper(), ledger_amount, ledger_note),
                )

                conn.commit()

        return PaperOrderResult(
            isin=isin,
            side=side_normalized,
            amount=float(amount),
            quantity=float(quantity),
            price=float(price),
            gross_value=float(gross_value),
            realized_pnl=float(realized_pnl),
            cash_balance=float(new_cash),
        )

    def reset(self, user_id: int, initial_cash: float = 0.0) -> None:
        cash = max(0.0, float(initial_cash))
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM holdings WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM trades WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM wallet_ledger WHERE user_id = ?", (user_id,))
                conn.execute(
                    "UPDATE wallet SET cash_balance = ?, updated_at = datetime('now') WHERE user_id = ?",
                    (cash, user_id),
                )
                if cash > 0:
                    conn.execute(
                        """
                        INSERT INTO wallet_ledger (user_id, kind, amount, note, created_at)
                        VALUES (?, 'FUND', ?, 'Reset funding', datetime('now'))
                        """,
                        (user_id, cash),
                    )
                conn.commit()

    def set_instrument_metadata(
        self, isin: str, name: str, expiry: Optional[str] = None
    ) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO instrument_metadata (isin, name, expiry, created_at)
                    VALUES (?, ?, ?, datetime('now'))
                    """,
                    (isin, name, expiry),
                )
                conn.commit()

    def get_instrument_metadata(self) -> Dict[str, Dict]:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT isin, name, expiry FROM instrument_metadata"
                ).fetchall()
                return {
                    row["isin"]: {"name": row["name"], "expiry": row["expiry"]}
                    for row in rows
                }
