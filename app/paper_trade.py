import sqlite3
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional

DEFAULT_WATCHLIST_STOCKS = [
    {"name": "Trident", "isin": "INE064C01022"},
    {"name": "NIFTYBEES", "isin": "INF204KB14I2"},
    {"name": "Bharti Airtel", "isin": "INE397D01024"},
    {"name": "TCS", "isin": "INE467B01029"},
]


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
    """Lightweight SQLite-backed paper trading storage."""

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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS wallet (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    cash_balance REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS holdings (
                    isin TEXT PRIMARY KEY,
                    quantity REAL NOT NULL,
                    avg_price REAL NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS wallet_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    amount REAL NOT NULL,
                    note TEXT,
                    created_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS watchlist_stocks (
                    isin TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                INSERT OR IGNORE INTO wallet (id, cash_balance, updated_at)
                VALUES (1, 0, datetime('now'))
                """)
            for row in DEFAULT_WATCHLIST_STOCKS:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO watchlist_stocks (isin, name, created_at)
                    VALUES (?, ?, datetime('now'))
                    """,
                    (row["isin"], row["name"]),
                )
            conn.commit()

    def get_cash_balance(self) -> float:
        with self._connect() as conn:
            row = conn.execute("SELECT cash_balance FROM wallet WHERE id = 1").fetchone()
            return float(row["cash_balance"] if row else 0.0)

    def get_total_funded(self) -> float:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_ledger"
                " WHERE kind = 'FUND'"
            ).fetchone()
            return float(row["total"] if row else 0.0)

    def add_funds(self, amount: float, note: Optional[str] = None) -> float:
        if amount <= 0:
            raise ValueError("Funding amount must be greater than zero.")

        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT cash_balance FROM wallet WHERE id = 1").fetchone()
                current = float(row["cash_balance"] if row else 0.0)
                new_balance = current + float(amount)

                conn.execute(
                    "UPDATE wallet SET cash_balance = ?, updated_at = datetime('now') "
                    "WHERE id = 1",
                    (new_balance,),
                )
                conn.execute(
                    """
                    INSERT INTO wallet_ledger (kind, amount, note, created_at)
                    VALUES ('FUND', ?, ?, datetime('now'))
                    """,
                    (float(amount), note or "Admin funding"),
                )
                conn.commit()
                return new_balance

    def list_ledger(self, limit: int = 50) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, kind, amount, note, created_at
                FROM wallet_ledger
                ORDER BY id DESC
                LIMIT ?
                """,
                (max(1, int(limit)),),
            ).fetchall()
            return [dict(row) for row in rows]

    def list_trades(self, limit: int = 100) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, isin, side, amount, quantity, price, gross_value, realized_pnl,
                created_at FROM trades
                ORDER BY id DESC
                LIMIT ?
                """,
                (max(1, int(limit)),),
            ).fetchall()
            return [dict(row) for row in rows]

    def list_holdings(self) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute("""
                SELECT isin, quantity, avg_price, updated_at
                FROM holdings
                ORDER BY isin ASC
                """).fetchall()
            return [dict(row) for row in rows]

    def list_stocks(self, query: Optional[str] = None, limit: int = 200) -> List[Dict]:
        with self._connect() as conn:
            q = (query or "").strip()
            if q:
                pattern = f"%{q}%"
                rows = conn.execute(
                    """
                    SELECT isin, name, created_at
                    FROM watchlist_stocks
                    WHERE isin LIKE ? OR name LIKE ?
                    ORDER BY name ASC
                    LIMIT ?
                    """,
                    (pattern, pattern, max(1, int(limit))),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT isin, name, created_at
                    FROM watchlist_stocks
                    ORDER BY name ASC
                    LIMIT ?
                    """,
                    (max(1, int(limit)),),
                ).fetchall()
            return [dict(row) for row in rows]

    def add_stock(self, isin: str, name: str) -> Dict:
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
                    INSERT INTO watchlist_stocks (isin, name, created_at)
                    VALUES (?, ?, datetime('now'))
                    ON CONFLICT(isin) DO UPDATE SET
                        name = excluded.name
                    """,
                    (normalized_isin, normalized_name),
                )
                conn.commit()
        return {"isin": normalized_isin, "name": normalized_name}

    def remove_stock(self, isin: str) -> None:
        normalized_isin = (isin or "").strip().upper()
        if not normalized_isin:
            raise ValueError("ISIN is required.")

        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM watchlist_stocks WHERE isin = ?", (normalized_isin,))
                conn.commit()

    def get_realized_pnl(self) -> float:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(realized_pnl), 0) AS total FROM trades WHERE side = 'sell'"
            ).fetchone()
            return float(row["total"] if row else 0.0)

    def place_order(
        self, isin: str, side: str, amount: float, price: float
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
                    "SELECT cash_balance FROM wallet WHERE id = 1"
                ).fetchone()
                cash_balance = float(wallet_row["cash_balance"] if wallet_row else 0.0)
                holding_row = conn.execute(
                    "SELECT quantity, avg_price FROM holdings WHERE isin = ?",
                    (isin,),
                ).fetchone()
                current_qty = float(holding_row["quantity"] if holding_row else 0.0)
                current_avg = float(holding_row["avg_price"] if holding_row else 0.0)

                quantity = float(amount) / float(price)
                gross_value = float(quantity * price)
                realized_pnl = 0.0

                if side_normalized == "buy":
                    if cash_balance + 1e-9 < gross_value:
                        raise ValueError("Insufficient cash balance for this buy order.")
                    new_cash = cash_balance - gross_value
                    new_qty = current_qty + quantity
                    new_avg = (
                        ((current_qty * current_avg) + (quantity * price)) / new_qty
                        if new_qty > 0
                        else 0.0
                    )
                else:
                    if current_qty <= 0:
                        raise ValueError("No holdings available to sell.")
                    if quantity > current_qty + 1e-9:
                        raise ValueError("Sell amount exceeds available holdings value.")

                    new_cash = cash_balance + gross_value
                    new_qty = max(0.0, current_qty - quantity)
                    new_avg = current_avg if new_qty > 0 else 0.0
                    realized_pnl = (price - current_avg) * quantity

                conn.execute(
                    "UPDATE wallet SET cash_balance = ?, updated_at = datetime('now')"
                    " WHERE id = 1",
                    (new_cash,),
                )

                if new_qty <= 1e-12:
                    conn.execute("DELETE FROM holdings WHERE isin = ?", (isin,))
                elif holding_row:
                    conn.execute(
                        """
                        UPDATE holdings
                        SET quantity = ?, avg_price = ?, updated_at = datetime('now')
                        WHERE isin = ?
                        """,
                        (new_qty, new_avg, isin),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO holdings (isin, quantity, avg_price, updated_at)
                        VALUES (?, ?, ?, datetime('now'))
                        """,
                        (isin, new_qty, new_avg),
                    )

                conn.execute(
                    """
                    INSERT INTO trades (
                    isin, side, amount, quantity, price, gross_value, realized_pnl, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    """,
                    (
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
                    INSERT INTO wallet_ledger (kind, amount, note, created_at)
                    VALUES (?, ?, ?, datetime('now'))
                    """,
                    (side_normalized.upper(), ledger_amount, ledger_note),
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

    def reset(self, initial_cash: float = 0.0) -> None:
        cash = max(0.0, float(initial_cash))
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM holdings")
                conn.execute("DELETE FROM trades")
                conn.execute("DELETE FROM wallet_ledger")
                conn.execute(
                    "UPDATE wallet SET cash_balance = ?, updated_at = datetime('now')"
                    " WHERE id = 1",
                    (cash,),
                )
                if cash > 0:
                    conn.execute(
                        """
                        INSERT INTO wallet_ledger (kind, amount, note, created_at)
                        VALUES ('FUND', ?, 'Reset funding', datetime('now'))
                        """,
                        (cash,),
                    )
                conn.commit()
