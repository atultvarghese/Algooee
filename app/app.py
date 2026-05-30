import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv


def _load_env_robust(override=False):
    load_dotenv(override=override)
    frozen = getattr(sys, "frozen", False)
    if frozen:
        exe_env = Path(sys.executable).parent / ".env"
        if exe_env.exists():
            load_dotenv(dotenv_path=str(exe_env), override=True)


class UpstoxClient:
    """
    A simple wrapper for the Upstox API (v3).
    Supports fetching historical candle data for instruments.
    """

    BASE_URL = "https://api.upstox.com/v3"

    def __init__(self):
        _load_env_robust()
        self.api_token = os.getenv("UPSTOX_API_TOKEN")
        if not self.api_token:
            raise ValueError("Missing UPSTOX_API_TOKEN in .env file")

        self.headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_token}",
        }

    def _make_request(self, endpoint, params=None, use_analytics_token=False):
        """Private helper to send GET requests to Upstox API."""
        if endpoint.startswith("/v2/") or endpoint.startswith("/v3/"):
            url = f"https://api.upstox.com{endpoint}"
        else:
            url = f"{self.BASE_URL}{endpoint}"
        
        headers = self.headers.copy()
        if use_analytics_token:
            _load_env_robust(override=True)
            analytics_token = os.getenv("UPSTOX_ANALYTICS_TOKEN")
            if analytics_token:
                headers["Authorization"] = f"Bearer {analytics_token}"

        response = requests.get(url, headers=headers, params=params)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"[Upstox API Error] {response.status_code}: {response.text}")

    def get_historical_candles(
        self, isin, start_date, end_date, interval="month", count=1, exchange="NSE_EQ"
    ):
        """
        Fetch historical candle data for a given ISIN.
        :param isin: Instrument ISIN code
        :param start_date: Start date (YYYY-MM-DD)
        :param end_date: End date (YYYY-MM-DD)
        :param interval: Candle interval (minute, day, month, etc.)
        :param count: Number of intervals per candle (e.g., 1 month)
        :param exchange: Exchange type (default NSE_EQ)
        :return: List of candles (if successful)
        """
        encoded_symbol = f"{exchange}%7C{isin}"
        endpoint = (
            f"/historical-candle/{encoded_symbol}/{interval}s/{count}/{end_date}/{start_date}"
        )

        data = self._make_request(endpoint)
        return data.get("data", {}).get("candles", [])

    def get_ltp_quote(self, isin, exchange="NSE_EQ"):
        """
        Fetch latest traded price quote for a given ISIN.
        :param isin: Instrument ISIN code
        :param exchange: Exchange type (default NSE_EQ)
        :return: Quote payload with last_price and previous close when available
        """
        instrument_key = isin if "|" in isin else f"{exchange}|{isin}"
        data = self._make_request(
            "/market-quote/ltp",
            params={"instrument_key": instrument_key},
        )
        quote_map = data.get("data", {})
        if not quote_map:
            return {}
        return next(iter(quote_map.values()))

    def get_intraday_candles(self, isin, interval="minutes", count=1, exchange="NSE_EQ"):
        """
        Fetch current trading day intraday candles for a given ISIN.
        :param isin: Instrument ISIN code
        :param interval: Candle interval unit (minutes, hours, days)
        :param count: Number of interval units
        :param exchange: Exchange type (default NSE_EQ)
        :return: List of intraday candles (if successful)
        """
        encoded_symbol = f"{exchange}%7C{isin}"
        endpoint = f"/historical-candle/intraday/{encoded_symbol}/{interval}/{count}"

        data = self._make_request(endpoint)
        return data.get("data", {}).get("candles", [])

    def get_option_contracts(self, underlying_key, expiry_date=None):
        """
        Fetch available option contracts for an underlying symbol.
        :param underlying_key: Instrument key of the underlying (e.g. NSE_EQ|INE002A01018)
        :param expiry_date: Expiry date filter (YYYY-MM-DD)
        :return: List of option contract details
        """
        params = {"instrument_key": underlying_key}
        if expiry_date:
            params["expiry_date"] = expiry_date

        data = self._make_request(
            "/v2/option/contract", params=params, use_analytics_token=True
        )
        return data.get("data", [])

    def get_option_chain(self, underlying_key, expiry_date):
        """
        Fetch put/call option chain for an underlying symbol and expiry.
        :param underlying_key: Instrument key of the underlying (e.g. NSE_EQ|INE002A01018)
        :param expiry_date: Expiry date (YYYY-MM-DD)
        :return: List of strike-wise call and put option contracts
        """
        params = {
            "instrument_key": underlying_key,
            "expiry_date": expiry_date
        }
        data = self._make_request("/v2/option/chain", params=params, use_analytics_token=True)
        return data.get("data", [])

    def search_instruments(self, query, exchange=None, segment=None):
        """
        Search for instruments using query and optional filters.
        :param query: Symbol, name, ISIN, etc.
        :param exchange: Exchange filter (e.g. NSE, BSE)
        :param segment: Segment filter (e.g. EQ, FO)
        :return: List of matching instruments
        """
        params = {"query": query}
        if exchange:
            params["exchange"] = exchange
        if segment:
            params["segment"] = segment

        data = self._make_request(
            "/v2/instruments/search", params=params, use_analytics_token=True
        )
        return data.get("data", [])
