import sqlite3
import threading
from unittest.mock import patch

# pyrefly: ignore [missing-import]
import pytest

# pyrefly: ignore [missing-import]
from app.paper_trade import PaperTradeStore


class PaperTradeStoreTestHelper(PaperTradeStore):
    """Use single in-memory connection for testing."""

    def __init__(self):
        self.db_path = ":memory:"
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()

    def _connect(self):
        class DummyConn:
            def __init__(self, conn):
                self.conn = conn

            def __enter__(self):
                return self.conn

            def __exit__(self, exc_type, exc_val, exc_tb):
                pass

        return DummyConn(self._conn)


@pytest.fixture
def mock_paper_trade():
    return PaperTradeStoreTestHelper()


def test_get_total_funded_returns_float(mock_paper_trade):
    # Patch _connect to avoid hitting real DB
    with patch.object(mock_paper_trade, "_connect") as mock_conn:
        conn_enter = mock_conn.return_value.__enter__.return_value
        execute_mock = conn_enter.execute.return_value
        fetchone_mock = execute_mock.fetchone
        fetchone_mock.return_value = {"total": 1000}

        total = mock_paper_trade.get_total_funded(user_id=1)
        assert isinstance(total, float)
        assert total == 1000.0


def test_add_funds_updates_cash_balance(mock_paper_trade):
    initial_balance = mock_paper_trade.get_cash_balance(user_id=1)
    new_balance = mock_paper_trade.add_funds(user_id=1, amount=500)
    assert new_balance == initial_balance + 500
    assert mock_paper_trade.get_cash_balance(user_id=1) == new_balance


def test_add_funds_raises_on_negative(mock_paper_trade):
    with pytest.raises(ValueError):
        mock_paper_trade.add_funds(user_id=1, amount=-100)


def test_list_trades_returns_list(mock_paper_trade):
    trades = mock_paper_trade.list_trades(user_id=1)
    assert isinstance(trades, list)


def test_list_holdings_returns_list(mock_paper_trade):
    holdings = mock_paper_trade.list_holdings(user_id=1)
    assert isinstance(holdings, list)


def test_place_order_buy_creates_order(mock_paper_trade):
    mock_paper_trade.add_funds(user_id=1, amount=10000)
    result = mock_paper_trade.place_order(user_id=1, isin="INE064C01022", side="buy", amount=5000, price=100)
    assert result.side == "buy"
    assert result.amount == 5000
    assert isinstance(result.cash_balance, float)


def test_place_order_sell_without_holdings_raises(mock_paper_trade):
    with pytest.raises(ValueError):
        mock_paper_trade.place_order(user_id=1, isin="INE064C01022", side="sell", amount=1000, price=100)


def test_fifo_multiple_purchases_and_partial_sales(mock_paper_trade):
    mock_paper_trade.add_funds(user_id=1, amount=10000)
    # Buy 1: 10 units at 100 each (amount 1000)
    mock_paper_trade.place_order(user_id=1, isin="INE397D01024", side="buy", amount=1000, price=100)
    # Buy 2: 5 units at 200 each (amount 1000)
    mock_paper_trade.place_order(user_id=1, isin="INE397D01024", side="buy", amount=1000, price=200)

    # list_holdings should return 2 separate rows
    holdings = mock_paper_trade.list_holdings(user_id=1)
    isin_holdings = [h for h in holdings if h["isin"] == "INE397D01024"]
    assert len(isin_holdings) == 2
    assert isin_holdings[0]["quantity"] == 10.0
    assert isin_holdings[0]["avg_price"] == 100.0
    assert isin_holdings[1]["quantity"] == 5.0
    assert isin_holdings[1]["avg_price"] == 200.0

    # Sell 12 units at 300 each (amount 3600)
    result = mock_paper_trade.place_order(user_id=1, isin="INE397D01024", side="sell", amount=3600, price=300)
    assert result.realized_pnl == 2200.0

    # Remaining holdings should be 1 row with 3 units of Buy 2
    holdings_after = mock_paper_trade.list_holdings(user_id=1)
    isin_holdings_after = [h for h in holdings_after if h["isin"] == "INE397D01024"]
    assert len(isin_holdings_after) == 1
    assert isin_holdings_after[0]["quantity"] == 3.0
    assert isin_holdings_after[0]["avg_price"] == 200.0


def test_user_segregation(mock_paper_trade):
    # 1. Create two users
    user_a = mock_paper_trade.create_user("user_a@algooee.local", "pwd123", "user")
    user_b = mock_paper_trade.create_user("user_b@algooee.local", "pwd456", "user")
    
    assert user_a != user_b
    
    # Verify initial cash balances
    assert mock_paper_trade.get_cash_balance(user_a) == 0.0
    assert mock_paper_trade.get_cash_balance(user_b) == 0.0
    
    # 2. Fund user_a, check that user_b balance remains 0
    mock_paper_trade.add_funds(user_a, 5000.0)
    assert mock_paper_trade.get_cash_balance(user_a) == 5000.0
    assert mock_paper_trade.get_cash_balance(user_b) == 0.0
    
    # 3. User A buys shares, check User B holdings remains empty
    mock_paper_trade.place_order(user_a, "INE064C01022", "buy", 2000.0, 100.0)
    
    holdings_a = mock_paper_trade.list_holdings(user_a)
    holdings_b = mock_paper_trade.list_holdings(user_b)
    
    assert len(holdings_a) == 1
    assert holdings_a[0]["isin"] == "INE064C01022"
    assert len(holdings_b) == 0
    
    # 4. Watchlist segregation
    # Initially user_a and user_b watchlist has default stocks
    watchlist_a = mock_paper_trade.list_stocks(user_a)
    watchlist_b = mock_paper_trade.list_stocks(user_b)
    assert len(watchlist_a) == len(watchlist_b)
    
    # User A removes Trident, check User B still has Trident
    mock_paper_trade.remove_stock(user_a, "INE064C01022")
    
    new_watchlist_a = mock_paper_trade.list_stocks(user_a)
    new_watchlist_b = mock_paper_trade.list_stocks(user_b)
    
    assert not any(s["isin"] == "INE064C01022" for s in new_watchlist_a)
    assert any(s["isin"] == "INE064C01022" for s in new_watchlist_b)