import sqlite3
import threading
from unittest.mock import patch

import pytest

from app.paper_trade import PaperTradeStore


class PaperTradeStoreTestHelper(PaperTradeStore):
    """Use single in-memory connection for testing."""

    def __init__(self):
        self.db_path = ":memory:"
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path)
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

        total = mock_paper_trade.get_total_funded()
        assert isinstance(total, float)
        assert total == 1000.0


def test_add_funds_updates_cash_balance(mock_paper_trade):
    initial_balance = mock_paper_trade.get_cash_balance()
    new_balance = mock_paper_trade.add_funds(500)
    assert new_balance == initial_balance + 500
    assert mock_paper_trade.get_cash_balance() == new_balance


def test_add_funds_raises_on_negative(mock_paper_trade):
    with pytest.raises(ValueError):
        mock_paper_trade.add_funds(-100)


def test_list_trades_returns_list(mock_paper_trade):
    trades = mock_paper_trade.list_trades()
    assert isinstance(trades, list)


def test_list_holdings_returns_list(mock_paper_trade):
    holdings = mock_paper_trade.list_holdings()
    assert isinstance(holdings, list)


def test_place_order_buy_creates_order(mock_paper_trade):
    mock_paper_trade.add_funds(10000)
    result = mock_paper_trade.place_order("INE064C01022", "buy", 5000, 100)
    assert result.side == "buy"
    assert result.amount == 5000
    assert isinstance(result.cash_balance, float)


def test_place_order_sell_without_holdings_raises(mock_paper_trade):
    with pytest.raises(ValueError):
        mock_paper_trade.place_order("INE064C01022", "sell", 1000, 100)


def test_fifo_multiple_purchases_and_partial_sales(mock_paper_trade):
    mock_paper_trade.add_funds(10000)
    # Buy 1: 10 units at 100 each (amount 1000)
    mock_paper_trade.place_order("INE397D01024", "buy", 1000, 100)
    # Buy 2: 5 units at 200 each (amount 1000)
    mock_paper_trade.place_order("INE397D01024", "buy", 1000, 200)

    # list_holdings should return 2 separate rows
    holdings = mock_paper_trade.list_holdings()
    isin_holdings = [h for h in holdings if h["isin"] == "INE397D01024"]
    assert len(isin_holdings) == 2
    assert isin_holdings[0]["quantity"] == 10.0
    assert isin_holdings[0]["avg_price"] == 100.0
    assert isin_holdings[1]["quantity"] == 5.0
    assert isin_holdings[1]["avg_price"] == 200.0

    # Sell 12 units at 300 each (amount 3600)
    result = mock_paper_trade.place_order("INE397D01024", "sell", 3600, 300)
    assert result.realized_pnl == 2200.0

    # Remaining holdings should be 1 row with 3 units of Buy 2
    holdings_after = mock_paper_trade.list_holdings()
    isin_holdings_after = [h for h in holdings_after if h["isin"] == "INE397D01024"]
    assert len(isin_holdings_after) == 1
    assert isin_holdings_after[0]["quantity"] == 3.0
    assert isin_holdings_after[0]["avg_price"] == 200.0