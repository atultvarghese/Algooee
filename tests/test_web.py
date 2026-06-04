from unittest.mock import patch
from fastapi.testclient import TestClient
# pyrefly: ignore [missing-import]
from app.web import app, get_current_user, get_current_admin, PAPER_STORE

# pyrefly: ignore [missing-import]
import app.web as app_web
# pyrefly: ignore [missing-import]
from tests.test_paper_trade import PaperTradeStoreTestHelper
# Override the store globally to use an in-memory database for testing
test_store = PaperTradeStoreTestHelper()
app_web.PAPER_STORE = test_store
PAPER_STORE = test_store

client = TestClient(app)

# Override dependencies for existing endpoints to allow them to pass without authorization headers
app.dependency_overrides[get_current_user] = lambda: {"id": 1, "email": "admin@algooee.local", "role": "admin"}
app.dependency_overrides[get_current_admin] = lambda: {"id": 1, "email": "admin@algooee.local", "role": "admin"}


def test_root_endpoint():
    with patch("app.web.Path.exists", return_value=False):
        response = client.get("/")
        assert response.status_code == 200
        assert "message" in response.json()


def test_prediction_endpoint_requires_token():
    payload = {
        "isin": "INE123A01011",
        "start_date": "2025-08-05",
        "end_date": "2025-08-05",
        "interval": "day",
        "count": 1,
    }
    response = client.post("/api/predict", json=payload)
    # Since Upstox token is not set, returns 503
    assert response.status_code == 503 or response.status_code == 400


def test_options_expiries_endpoint():
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_option_contracts.return_value = [
            {"expiry": "2026-06-25"},
            {"expiry": "2026-07-30"},
        ]

        response = client.get("/api/options/expiries/NIFTY")
        assert response.status_code == 200
        json_data = response.json()
        assert json_data["underlying_key"] == "NSE_INDEX|Nifty 50"
        assert json_data["expiries"] == ["2026-06-25", "2026-07-30"]


def test_options_chain_endpoint():
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_option_chain.return_value = [
            {
                "strike_price": 25000,
                "call_options": {"instrument_key": "NSE_FO|1"},
                "put_options": {"instrument_key": "NSE_FO|2"}
            }
        ]
        mock_upstox_client.get_option_contracts.return_value = [
            {"instrument_key": "NSE_FO|1", "lot_size": 50},
            {"instrument_key": "NSE_FO|2", "lot_size": 50}
        ]

        response = client.get("/api/options/chain?underlying_key=NIFTY&expiry_date=2026-06-25")
        assert response.status_code == 200
        json_data = response.json()
        assert json_data["underlying_key"] == "NSE_INDEX|Nifty 50"
        assert len(json_data["chain"]) == 1
        assert json_data["chain"][0]["strike_price"] == 25000
        assert json_data["chain"][0]["call_options"]["lot_size"] == 50
        assert json_data["chain"][0]["put_options"]["lot_size"] == 50


def test_live_instrument_search_endpoint():
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.search_instruments.return_value = [
            {
                "isin": "INE002A01018",
                "name": "RELIANCE INDUSTRIES LTD",
                "trading_symbol": "RELIANCE",
                "instrument_key": "NSE_EQ|INE002A01018"
            }
        ]

        response = client.get("/api/instruments/search?q=RELIANCE")
        assert response.status_code == 200
        json_data = response.json()
        assert "results" in json_data
        assert len(json_data["results"]) == 1
        assert json_data["results"][0]["isin"] == "INE002A01018"
        assert json_data["results"][0]["name"] == "RELIANCE INDUSTRIES LTD"


# Authentication and User Management Endpoint Tests
# Clear overrides to test actual route behaviors
def test_auth_flow():
    # Clean up existing test user if any from previous runs
    existing = PAPER_STORE.get_user_by_email("test_user_flow@algooee.local")
    if existing:
        PAPER_STORE.delete_user(existing["id"])

    original_user_dep = app.dependency_overrides.get(get_current_user)
    original_admin_dep = app.dependency_overrides.get(get_current_admin)
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
    if get_current_admin in app.dependency_overrides:
        del app.dependency_overrides[get_current_admin]

    try:
        email = "test_user_flow@algooee.local"
        password = "testpassword123"

        # 1. Register User
        reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
        assert reg_res.status_code == 200
        reg_data = reg_res.json()
        assert "token" in reg_data
        assert reg_data["user"]["email"] == email

        # 2. Login User
        login_res = client.post("/api/auth/login", json={"email": email, "password": password})
        assert login_res.status_code == 200
        login_data = login_res.json()
        token = login_data["token"]
        assert token

        # 3. Get profile (/api/auth/me)
        me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        assert me_res.json()["email"] == email

        # 4. Access without auth
        bad_me = client.get("/api/auth/me")
        assert bad_me.status_code == 401

        # 5. Logout
        logout_res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert logout_res.status_code == 200

        # 6. Get profile after logout (unauthorized)
        me_after = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_after.status_code == 401

    finally:
        # Restore overrides
        if original_user_dep:
            app.dependency_overrides[get_current_user] = original_user_dep
        if original_admin_dep:
            app.dependency_overrides[get_current_admin] = original_admin_dep


def test_user_management_access_controls():
    # Clean up existing test users if any from previous runs
    for email in ["std@algooee.local", "created@algooee.local", "updated@algooee.local"]:
        existing = PAPER_STORE.get_user_by_email(email)
        if existing:
            PAPER_STORE.delete_user(existing["id"])

    original_user_dep = app.dependency_overrides.get(get_current_user)
    original_admin_dep = app.dependency_overrides.get(get_current_admin)
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
    if get_current_admin in app.dependency_overrides:
        del app.dependency_overrides[get_current_admin]

    try:
        # Create non-admin and admin users
        client.post("/api/auth/register", json={"email": "std@algooee.local", "password": "pass"})
        # The first user is admin (admin@algooee.local) which was seeded in DB migration
        admin_login = client.post("/api/auth/login", json={"email": "admin@algooee.local", "password": "admin123"})
        admin_token = admin_login.json()["token"]

        user_login = client.post("/api/auth/login", json={"email": "std@algooee.local", "password": "pass"})
        user_token = user_login.json()["token"]

        # Non-admin tries to list users
        list_non_admin = client.get("/api/admin/users", headers={"Authorization": f"Bearer {user_token}"})
        assert list_non_admin.status_code == 403

        # Admin lists users
        list_admin = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert list_admin.status_code == 200
        users_list = list_admin.json()["users"]
        assert len(users_list) >= 2

        # Admin creates new user
        new_user = client.post(
            "/api/admin/users",
            json={"email": "created@algooee.local", "password": "newpassword", "role": "user"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert new_user.status_code == 200
        new_user_id = new_user.json()["user"]["id"]

        # Admin updates new user
        update_res = client.put(
            f"/api/admin/users/{new_user_id}",
            json={"email": "updated@algooee.local", "role": "admin"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert update_res.status_code == 200
        assert update_res.json()["user"]["role"] == "admin"

        # Admin deletes user
        del_res = client.delete(
            f"/api/admin/users/{new_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert del_res.status_code == 200

        # Try to delete oneself
        my_id = admin_login.json()["user"]["id"]
        del_self = client.delete(
            f"/api/admin/users/{my_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert del_self.status_code == 400

    finally:
        if original_user_dep:
            app.dependency_overrides[get_current_user] = original_user_dep
        if original_admin_dep:
            app.dependency_overrides[get_current_admin] = original_admin_dep


# --- Additional Web API Tests ---

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_auth_register_duplicate_and_validation():
    email = "duplicate@algooee.local"
    # Clean up if already exists
    existing = PAPER_STORE.get_user_by_email(email)
    if existing:
        PAPER_STORE.delete_user(existing["id"])

    res = client.post("/api/auth/register", json={"email": email, "password": "password"})
    assert res.status_code == 200
    
    # Try duplicate
    res_dup = client.post("/api/auth/register", json={"email": email, "password": "password"})
    assert res_dup.status_code == 400
    assert "already exists" in res_dup.json()["detail"]

    # Try invalid email
    res_inv = client.post("/api/auth/register", json={"email": "invalid_email", "password": "password"})
    assert res_inv.status_code == 400

    # Try empty email
    res_empty = client.post("/api/auth/register", json={"email": "", "password": "password"})
    assert res_empty.status_code == 400


def test_auth_login_failures():
    # Login with non-existent email
    res_non = client.post("/api/auth/login", json={"email": "nonexistent@algooee.local", "password": "123"})
    assert res_non.status_code == 400

    # Login with wrong password
    email = "login_fail@algooee.local"
    existing = PAPER_STORE.get_user_by_email(email)
    if existing:
        PAPER_STORE.delete_user(existing["id"])

    client.post("/api/auth/register", json={"email": email, "password": "correctpassword"})
    res_wrong = client.post("/api/auth/login", json={"email": email, "password": "wrongpassword"})
    assert res_wrong.status_code == 400


def test_auth_logout_no_token():
    res = client.post("/api/auth/logout")
    assert res.status_code == 200
    assert "Logged out successfully" in res.json()["message"]


def test_admin_endpoints_failures():
    email = "admin_create_dup@algooee.local"
    existing = PAPER_STORE.get_user_by_email(email)
    if existing:
        PAPER_STORE.delete_user(existing["id"])

    client.post("/api/auth/register", json={"email": email, "password": "password"})
    
    # Post again as admin
    res = client.post("/api/admin/users", json={"email": email, "password": "password", "role": "user"})
    assert res.status_code == 400

    # Test admin update user failures
    res_role = client.put("/api/admin/users/1", json={"role": "superuser"})
    assert res_role.status_code == 400

    res_non = client.put("/api/admin/users/9999", json={"role": "user"})
    assert res_non.status_code == 400


def test_watchlist_endpoints():
    # 1. Add stock
    res_add = client.post("/api/stocks/add", json={"isin": "INE111A01011", "name": "Test Stock"})
    assert res_add.status_code == 200
    assert any(s["isin"] == "INE111A01011" for s in res_add.json()["stocks"])

    # 2. Get stock list (watchlist)
    res_get = client.get("/api/stocks?q=Test")
    assert res_get.status_code == 200
    assert len(res_get.json()["stocks"]) >= 1

    # 3. Search watchlist
    res_search = client.get("/api/stocks/search?q=INE111A01011")
    assert res_search.status_code == 200
    assert len(res_search.json()["stocks"]) == 1

    # 4. Remove stock
    res_del = client.delete("/api/stocks/INE111A01011")
    assert res_del.status_code == 200
    assert not any(s["isin"] == "INE111A01011" for s in res_del.json()["stocks"])


def test_watchlist_add_failures():
    res_empty_isin = client.post("/api/stocks/add", json={"isin": "", "name": "Name"})
    assert res_empty_isin.status_code == 400

    res_empty_name = client.post("/api/stocks/add", json={"isin": "ISIN", "name": ""})
    assert res_empty_name.status_code == 400


def test_paper_portfolio_and_fund_reset():
    # 1. Get portfolio
    with patch("app.web._fetch_latest_and_prev_close", return_value=(100.0, 99.0, "2026-06-03 15:30")):
        res_port = client.get("/api/paper/portfolio")
        assert res_port.status_code == 200
        assert "cash_balance" in res_port.json()

        # 2. Get admin
        res_adm = client.get("/api/paper/admin")
        assert res_adm.status_code == 200

        # 3. Fund wallet
        res_fund = client.post("/api/paper/admin/fund", json={"amount": 1000.0, "note": "bonus"})
        assert res_fund.status_code == 200
        assert res_fund.json()["cash_balance"] >= 1000.0

        # Try invalid funding amount
        res_bad_fund = client.post("/api/paper/admin/fund", json={"amount": -50.0})
        assert res_bad_fund.status_code == 400

        # 4. Reset wallet
        res_reset = client.post("/api/paper/admin/reset", json={"initial_cash": 5000.0})
        assert res_reset.status_code == 200
        assert res_reset.json()["cash_balance"] == 5000.0


def test_paper_trade_endpoints():
    # Fund wallet first
    client.post("/api/paper/admin/fund", json={"amount": 10000.0})

    # Mock _fetch_latest_and_prev_close
    with patch("app.web._fetch_latest_and_prev_close", return_value=(100.0, 98.0, "2026-06-03 15:30")):
        # 1. Place BUY order
        res_buy = client.post("/api/paper/trade", json={
            "isin": "INE123A01011",
            "side": "buy",
            "amount": 5000.0,
            "price": 100.0
        })
        assert res_buy.status_code == 200
        order = res_buy.json()["order"]
        assert order["side"] == "buy"
        assert order["quantity"] == 50.0

        # 2. Place option BUY order
        res_opt = client.post("/api/paper/trade", json={
            "isin": "NSE_FO|1111",
            "side": "buy",
            "amount": 1000.0,
            "price": 10.0,
            "option_symbol": "NIFTY26JUN25000CE",
            "option_expiry": "2026-06-25"
        })
        assert res_opt.status_code == 200

        # 3. Insufficient funds BUY order
        res_poor = client.post("/api/paper/trade", json={
            "isin": "INE123A01011",
            "side": "buy",
            "amount": 100000.0,
            "price": 100.0
        })
        assert res_poor.status_code == 400

        # 4. Sell order
        res_sell = client.post("/api/paper/trade", json={
            "isin": "INE123A01011",
            "side": "sell",
            "amount": 2000.0,
            "price": 100.0
        })
        assert res_sell.status_code == 200
        assert res_sell.json()["order"]["realized_pnl"] == 0.0

        # 5. Sell without holding
        res_no_hold = client.post("/api/paper/trade", json={
            "isin": "INE999A01011",
            "side": "sell",
            "amount": 2000.0,
            "price": 100.0
        })
        assert res_no_hold.status_code == 400

        # 6. Order with resolved execution price
        res_resolved = client.post("/api/paper/trade", json={
            "isin": "INE123A01011",
            "side": "buy",
            "amount": 1000.0
        })
        assert res_resolved.status_code == 200
        assert res_resolved.json()["order"]["price"] == 100.0

    # 7. Unresolved price
    with patch("app.web._fetch_latest_and_prev_close", return_value=(None, None, None)):
        res_unres = client.post("/api/paper/trade", json={
            "isin": "INE123A01011",
            "side": "buy",
            "amount": 1000.0
        })
        assert res_unres.status_code == 400


def test_market_quote_endpoints():
    # 1. Client not configured
    with patch("app.web.client", None):
        res_503 = client.get("/api/market-quote/ltp/INE002A01018")
        assert res_503.status_code == 503

    # 2. Success from ltp quote
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_ltp_quote.return_value = {"last_price": 2500.0, "cp": 2480.0}
        res_ltp = client.get("/api/market-quote/ltp/INE002A01018")
        assert res_ltp.status_code == 200
        assert res_ltp.json()["last_price"] == 2500.0
        assert res_ltp.json()["source"] == "ltp"

    # 3. Fallback to intraday
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_ltp_quote.return_value = {}
        mock_upstox_client.get_intraday_candles.return_value = [
            ["2026-06-03 15:30:00", 2490.0, 2500.0, 2480.0, 2495.0, 1000, 0]
        ]
        with patch("app.web._fetch_close_snapshot", return_value=(2480.0, 2470.0, "2026-06-02")):
            res_intraday = client.get("/api/market-quote/ltp/INE002A01018")
            assert res_intraday.status_code == 200
            assert res_intraday.json()["last_price"] == 2495.0
            assert res_intraday.json()["source"] == "intraday"

    # 4. Fallback to latest close
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_ltp_quote.return_value = {}
        mock_upstox_client.get_intraday_candles.return_value = []
        with patch("app.web._fetch_latest_and_prev_close", return_value=(2475.0, 2460.0, "2026-06-02")):
            res_latest = client.get("/api/market-quote/ltp/INE002A01018")
            assert res_latest.status_code == 200
            assert res_latest.json()["last_price"] == 2475.0
            assert res_latest.json()["source"] == "historical_candle"

    # 5. Price not found
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_ltp_quote.return_value = {}
        mock_upstox_client.get_intraday_candles.return_value = []
        with patch("app.web._fetch_latest_and_prev_close", return_value=(None, None, None)):
            res_404 = client.get("/api/market-quote/ltp/INE002A01018")
            assert res_404.status_code == 404


def test_historical_candles_endpoint_failures():
    # 1. Client not configured
    with patch("app.web.client", None):
        res = client.post("/api/historical-candles", json={"isin": "INE1", "start_date": "2026-01-01", "end_date": "2026-01-02"})
        assert res.status_code == 503

    # 2. Client raises error
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_historical_candles.side_effect = Exception("API error")
        res = client.post("/api/historical-candles", json={"isin": "INE1", "start_date": "2026-01-01", "end_date": "2026-01-02"})
        assert res.status_code == 400


def test_predict_endpoint_success_and_cache():
    # Prepare mock candles
    candles = []
    import math
    import datetime
    start_date = datetime.datetime(2026, 1, 1, 9, 15)
    for idx in range(120):
        dt = start_date + datetime.timedelta(days=idx)
        dt_str = dt.strftime("%Y-%m-%d %H:%M:%S")
        close_price = 100.0 + idx * 0.2 + math.sin(idx) * 2
        candles.append([
            dt_str,
            close_price - 1.0,
            close_price + 2.0,
            close_price - 2.0,
            close_price,
            10000,
            0
        ])

    payload = {
        "isin": "INE123A01011",
        "start_date": "2026-01-01",
        "end_date": "2026-04-30",
        "interval": "day",
        "count": 1,
        "forecast_days": 3,
        "backtest_days": 10
    }

    app_web.PREDICTION_CACHE = {}

    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_historical_candles.return_value = candles

        res = client.post("/api/predict", json=payload)
        assert res.status_code == 200
        data1 = res.json()
        assert "predicted_high" in data1
        assert "confidence" in data1

        # Second request - hit cache
        mock_upstox_client.get_historical_candles.side_effect = AssertionError("Should not be called")
        res2 = client.post("/api/predict", json=payload)
        assert res2.status_code == 200
        assert res2.json()["predicted_high"] == data1["predicted_high"]


def test_predict_endpoint_failures():
    payload = {
        "isin": "INE123A01011",
        "start_date": "2026-01-01",
        "end_date": "2026-04-30",
    }
    # 1. Unconfigured client
    with patch("app.web.client", None):
        res = client.post("/api/predict", json=payload)
        assert res.status_code == 503

    # 2. No candles found
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_historical_candles.return_value = []
        res = client.post("/api/predict", json=payload)
        assert res.status_code == 404

    # 3. Model training / processing failure
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_historical_candles.return_value = [["invalid", "data"]]
        res = client.post("/api/predict", json=payload)
        assert res.status_code == 400


def test_options_endpoints_failures():
    # 1. Expiries - client None
    with patch("app.web.client", None):
        res = client.get("/api/options/expiries/NIFTY")
        assert res.status_code == 503

    # 2. Expiries - client Exception
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_option_contracts.side_effect = Exception("error")
        res = client.get("/api/options/expiries/NIFTY")
        assert res.status_code == 400

    # 3. Chain - client None
    with patch("app.web.client", None):
        res = client.get("/api/options/chain?underlying_key=NIFTY&expiry_date=2026-06-25")
        assert res.status_code == 503

    # 4. Chain - client Exception
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.get_option_chain.side_effect = Exception("error")
        res = client.get("/api/options/chain?underlying_key=NIFTY&expiry_date=2026-06-25")
        assert res.status_code == 400


def test_instruments_search_endpoint_failures():
    # 1. Search - client None
    with patch("app.web.client", None):
        res = client.get("/api/instruments/search?q=REL")
        assert res.status_code == 503

    # 2. Search - client Exception
    with patch("app.web.client") as mock_upstox_client:
        mock_upstox_client.search_instruments.side_effect = Exception("error")
        res = client.get("/api/instruments/search?q=REL")
        assert res.status_code == 400