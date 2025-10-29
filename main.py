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
Hindustan Unilever	INE030A01027
ITC	INE154A01025
Mahindra & Mahindra	INE101A01026
Kotak Mahindra Bank	INE237A01028
HCL Technologies	INE860A01027
Sun Pharmaceutical Industries	INE044A01036
Axis Bank	INE238A01034
UltraTech Cement	INE481G01011
Titan Company	INE280A01028
NTPC	INE733E01010
Asian Paints	INE021A01026
Tata Steel	INE081A01020
Tata Consumer Products	INE192A01025
Wipro	INE075A01022
Adani Enterprises	INE423A01024
Adani Ports	INE742F01042
"""
# Define the headers based on the Upstox API documentation
"""
data.candle[0]	number	Timestamp: Indicating the start time of the candle's timeframe.
data.candle[1]	number	Open: The opening price of the asset for the given timeframe.
data.candle[2]	number	High: The highest price at which the asset traded during the timeframe.
data.candle[3]	number	Low: The lowest price at which the asset traded during the timeframe.
data.candle[4]	number	Close: The closing price of the asset for the given timeframe.
data.candle[5]	number	Volume: The total amount of the asset that was traded during the timeframe.
data.candle[6]	number	Open Interest: The total number of outstanding derivative contracts, such as options or futures.
"""
headers = ["Timestamp", "Open", "High", "Low", "Close", "Volume", "Open Interest"]

client = UpstoxClient()

def check_stock(isin):

        candles = client.get_historical_candles(
            isin=isin,
            start_date="2025-01-01",
            end_date="2025-10-28",
            interval="day",
            count=1
        )

        df = pd.DataFrame(candles, columns=headers)
        # print(df)
        predictor = Prediction(df)
        predictor.feature_engineering()
        X_test, y_test, preds = predictor.train_model()
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