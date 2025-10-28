import os
import requests
from dotenv import load_dotenv

class UpstoxClient:
    """
    A simple wrapper for the Upstox API (v3).
    Supports fetching historical candle data for instruments.
    """

    BASE_URL = "https://api.upstox.com/v3"

    def __init__(self):
        load_dotenv()
        self.api_token = os.getenv("UPSTOX_API_TOKEN")
        if not self.api_token:
            raise ValueError("Missing UPSTOX_API_TOKEN in .env file")

        self.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.api_token}'
        }

    def _make_request(self, endpoint, params=None):
        """Private helper to send GET requests to Upstox API."""
        url = f"{self.BASE_URL}{endpoint}"
        response = requests.get(url, headers=self.headers, params=params)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(
                f"[Upstox API Error] {response.status_code}: {response.text}"
            )

    def get_historical_candles(self, isin, start_date, end_date, interval="month", count=1, exchange="NSE_EQ"):
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
        endpoint = f"/historical-candle/{encoded_symbol}/{interval}s/{count}/{end_date}/{start_date}"

        data = self._make_request(endpoint)
        return data.get("data", {}).get("candles", [])

