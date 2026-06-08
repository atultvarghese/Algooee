# This is a sample Python script.
import pandas as pd

from app.app import UpstoxClient
from core.prediction import Prediction

company_isin = """Reliance Industries	INE002A01018
Bharti Airtel	INE397D01024
Tata Consultancy Services (TCS)	INE467B01029
ICICI Bank	INE090A01021
State Bank of India (SBI)	INE062A01020
Infosys	INE009A01021
"""
# Define the headers based on the Upstox API documentation
"""
data.candle[0]	Timestamp: Indicating the start time of the candle's timeframe.
data.candle[1]	Open: The opening price of the asset for the given timeframe.
data.candle[2]	High: The highest price at which the asset traded during the timeframe.
data.candle[3]	Low: The lowest price at which the asset traded during the timeframe.
data.candle[4]	Close: The closing price of the asset for the given timeframe.
data.candle[5]	Volume: The total amount of the asset that was traded during the timeframe.
data.candle[6]	Open Interest: The total number of outstanding derivative contracts, 
                such as options or futures.
"""
headers = ["Timestamp", "Open", "High", "Low", "Close", "Volume", "Open Interest"]

client = UpstoxClient()


def check_stock(isin):

    candles = client.get_historical_candles(
        isin=isin,
        start_date="2025-01-01",
        end_date="2025-10-28",
        interval="day",
        count=1,
    )

    df = pd.DataFrame(candles, columns=headers)
    # print(df)
    predictor = Prediction(df)
    predictor.feature_engineering()
    X_test, y_test, preds = predictor.train_model()

    # Debug walk-forward prediction for the latest candle (Today) using data till yesterday
    if not predictor.backtest_df.empty:
        last_row = predictor.backtest_df.iloc[-1]
        print(f"\n🔍 Debugging Walk-Forward Prediction for Last Available Candle (Today):")
        print(f"  Target Date (Today):          {last_row['timestamp']}")
        print(f"  Actual High (Today):          {last_row['actual_high']:.2f}")
        print(f"  Predicted High (Today):       {last_row['predicted_high']:.2f}")
        print(f"  Absolute Error:               {last_row['abs_error']:.2f}")
        print(f"  Error Percentage:             {last_row['error_pct']:.2f}%")
        hit_str = "✅ Correct" if last_row['directional_hit'] else "❌ Incorrect"
        print(f"  Directional Move Hit:         {hit_str}")
        print(f"  Prediction Interval:          [{last_row['p10']:.2f}, {last_row['p90']:.2f}]")
        print("----------------------------------------------------\n")

    # predictor.plot_results(y_test, preds)
    predictor.predict_next_day()


if __name__ == "__main__":
    for stock in company_isin.splitlines():
        print("---" * 8, stock, "---" * 8)
        isin = stock.strip().split("	")[-1]
        print(isin)
        check_stock(isin)
        # break
    check_stock("INE064C01022")
