from unittest.mock import patch
from fastapi.testclient import TestClient
# pyrefly: ignore [missing-import]
from app.web import app, get_current_user, get_current_admin, PAPER_STORE

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