# This is a sample Python script.
import pandas as pd
from app.app import UpstoxClient

company_isin = """Reliance Industries	INE002A01018
HDFC Bank	INE040A01037
Bharti Airtel	INE397D01024
Tata Consultancy Services (TCS)	INE467B01029
ICICI Bank	INE090A01021
State Bank of India (SBI)	INE062A01020
Bajaj Finance	INE296A01024
Infosys	INE009A01021
Hindustan Unilever	INE030A01027
Larsen & Toubro	INE049A01026
ITC	INE154A01025
Maruti Suzuki India	INE091A01022
Mahindra & Mahindra	INE101A01026
Kotak Mahindra Bank	INE237A01028
HCL Technologies	INE860A01027
Sun Pharmaceutical Industries	INE044A01036
Axis Bank	INE238A01034
UltraTech Cement	INE481G01011
Bajaj Finserv	INE918I01018
Titan Company	INE280A01028
NTPC	INE733E01010
Asian Paints	INE021A01026
Tata Steel	INE081A01020
Tata Consumer Products	INE192A01025
Wipro	INE075A01022
Adani Enterprises	INE423A01024
Adani Ports	INE742F01042
JSW Steel	INE019A01022
Power Grid Corporation of India	INE752E01010
IndusInd Bank	INE095A01012
Grasim Industries	INE047A01021
Apollo Hospitals	INE437A01024
ONGC	INE213A01029
Coal India	INE522F01014
Dr. Reddy's Laboratories	INE089A01023
Eicher Motors	INE066A01029
Bajaj Auto	INE917I01010
Tech Mahindra	INE669C01036
Hero MotoCorp	INE028A01013
Shriram Finance	INE746G01029
LTIMindtree	INE214T01019
Britannia Industries	INE216A01030
Cipla	INE059A01026
UPL	INE628A01036
JSW Energy	INE121A01017
Pidilite Industries	INE318A01026
Adani Green Energy	INE364L01016
HDFC Life Insurance	INE795G01014
SBI Life Insurance	INE123W01016
Divi's Laboratories	INE361B01024"""
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


def check_stock():
    client = UpstoxClient()

    for stock in company_isin.splitlines():
        print("---"*8 , stock, "---"*8)
        isin = stock.strip().split("	")[-1]

        candles = client.get_historical_candles(
            isin=isin,
            start_date="2025-01-01",
            end_date="2025-10-01",
            interval="month",
            count=1
        )

        df = pd.DataFrame(candles, columns=headers)
        print(df)
        break


# Press the green button in the gutter to run the script.
if __name__ == '__main__':
    check_stock()

# See PyCharm help at https://www.jetbrains.com/help/pycharm/
