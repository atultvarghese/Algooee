import os
from unittest.mock import patch, MagicMock

# pyrefly: ignore [missing-import]
import pytest
# pyrefly: ignore [missing-import]
from app.app import UpstoxClient


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token"})
def test_upstox_client_initialization_success():
    client = UpstoxClient()
    assert client.api_token == "mock_token"
    assert client.headers["Authorization"] == "Bearer mock_token"


@patch.dict(os.environ, {}, clear=True)
def test_upstox_client_initialization_failure():
    # If UPSTOX_API_TOKEN is missing, should raise ValueError
    # Ensure it's not loaded from .env during testing
    with patch("app.app.load_dotenv"):
        with pytest.raises(ValueError, match="Missing UPSTOX_API_TOKEN in .env file"):
            UpstoxClient()


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token", "UPSTOX_ANALYTICS_TOKEN": "mock_analytics"})
@patch("app.app.requests.get")
def test_make_request_success(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": "success_payload"}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    res = client._make_request("/test-endpoint")
    assert res == {"data": "success_payload"}
    mock_get.assert_called_once_with(
        "https://api.upstox.com/v3/test-endpoint",
        headers=client.headers,
        params=None
    )


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token", "UPSTOX_ANALYTICS_TOKEN": "mock_analytics"})
@patch("app.app.requests.get")
def test_make_request_v2_v3_url(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": "v2_v3"}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    res = client._make_request("/v2/test-endpoint")
    assert res == {"data": "v2_v3"}
    mock_get.assert_called_once_with(
        "https://api.upstox.com/v2/test-endpoint",
        headers=client.headers,
        params=None
    )


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token", "UPSTOX_ANALYTICS_TOKEN": "mock_analytics"})
@patch("app.app.requests.get")
def test_make_request_fallback_analytics_success(mock_get):
    # First request fails with 401, fallback requests succeeds with 200 using analytics token
    response_401 = MagicMock()
    response_401.status_code = 401
    
    response_200 = MagicMock()
    response_200.status_code = 200
    response_200.json.return_value = {"data": "analytics_success"}

    mock_get.side_effect = [response_401, response_200]

    client = UpstoxClient()
    res = client._make_request("/test-endpoint")
    assert res == {"data": "analytics_success"}
    assert mock_get.call_count == 2


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token"})
@patch("app.app.requests.get")
def test_make_request_failure_raises(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal error"
    mock_get.return_value = mock_response

    client = UpstoxClient()
    with pytest.raises(Exception, match="\\[Upstox API Error\\] 500: Internal error"):
        client._make_request("/test-endpoint")


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token"})
@patch("app.app.requests.get")
def test_get_historical_candles(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": {"candles": [[1, 2, 3]]}}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    candles = client.get_historical_candles("NSE_EQ|INE002A01018", "2026-01-01", "2026-01-02")
    assert candles == [[1, 2, 3]]

    candles2 = client.get_historical_candles("INE002A01018", "2026-01-01", "2026-01-02")
    assert candles2 == [[1, 2, 3]]


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token"})
@patch("app.app.requests.get")
def test_get_ltp_quote(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": {"NSE_EQ:INE002A01018": {"last_price": 2500}}}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    quote = client.get_ltp_quote("INE002A01018")
    assert quote == {"last_price": 2500}

    # Test empty payload
    mock_response.json.return_value = {"data": {}}
    assert client.get_ltp_quote("INE002A01018") == {}


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token"})
@patch("app.app.requests.get")
def test_get_intraday_candles(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": {"candles": [[10, 20]]}}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    candles = client.get_intraday_candles("INE002A01018")
    assert candles == [[10, 20]]


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token", "UPSTOX_ANALYTICS_TOKEN": "mock_analytics"})
@patch("app.app.requests.get")
def test_get_option_contracts(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": [{"instrument_key": "NSE_FO|1"}]}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    res = client.get_option_contracts("NSE_INDEX|Nifty 50", "2026-06-25")
    assert res == [{"instrument_key": "NSE_FO|1"}]


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token", "UPSTOX_ANALYTICS_TOKEN": "mock_analytics"})
@patch("app.app.requests.get")
def test_get_option_chain(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": [{"strike_price": 25000}]}
    mock_get.return_value = mock_response

    client = UpstoxClient()
    res = client.get_option_chain("NSE_INDEX|Nifty 50", "2026-06-25")
    assert res == [{"strike_price": 25000}]


@patch.dict(os.environ, {"UPSTOX_API_TOKEN": "mock_token", "UPSTOX_ANALYTICS_TOKEN": "mock_analytics"})
@patch("app.app.requests.get")
def test_search_instruments(mock_get):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": [{"isin": "INE123"}]}
    mock_get.return_value = mock_call = mock_response

    client = UpstoxClient()
    res = client.search_instruments("RELIANCE")
    assert res == [{"isin": "INE123"}]