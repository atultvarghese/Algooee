from unittest.mock import patch

from fastapi.testclient import TestClient

# pyrefly: ignore [missing-import]
from app.web import app

client = TestClient(app)


def test_root_endpoint():
    with patch("app.web.Path.exists", return_value=False):
        response = client.get("/")
        assert response.status_code == 200
        assert "message" in response.json()


def test_prediction_endpoint_requires_token():
    # Prepare a sample request payload
    payload = {
        "isin": "INE123A01011",
        "start_date": "2025-08-05",
        "end_date": "2025-08-05",
        "interval": "day",
        "count": 1,
    }

    # Call the POST endpoint
    response = client.post("/api/predict", json=payload)

    # Since we don't have an Upstox token, we expect a 503
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

        response = client.get("/api/options/chain?underlying_key=NIFTY&expiry_date=2026-06-25")
        assert response.status_code == 200
        json_data = response.json()
        assert json_data["underlying_key"] == "NSE_INDEX|Nifty 50"
        assert len(json_data["chain"]) == 1
        assert json_data["chain"][0]["strike_price"] == 25000


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