# This is a sample Python script.
import pandas as pd

# pyrefly: ignore [missing-import]
from fetch_stock_history import fetch_stock_history 
# pyrefly: ignore [missing-import]
from fetch_options_history import fetch_option_history

# df, start, end = fetch_stock_history("INE064C01022") #trident
# df, start, end = fetch_stock_history("INE040A01034") #hdfc
df, start, end = fetch_stock_history("INE335Y01020", days=31) #irctc


print(start, end)
print(df.head())

# 2. Convert Timestamp to datetime objects and sort
df['Timestamp'] = pd.to_datetime(df['Timestamp'])
df = df.sort_values('Timestamp')

# 3. Group the data by Date
grouped = df.groupby(df['Timestamp'].dt.date)

results = []
second_index = 4

for date, group in grouped:
    # Reset index for easy iloc access
    group = group.reset_index(drop=True)
    
    # Get the first 5-minute candle
    first_candle = group.iloc[0]
    second_candle = group.iloc[second_index] if len(group) > second_index else None
    first_open = first_candle['Close']
    first_close = second_candle['Close']
    
    # Determine trend (Up if Close > Open, else Down)
    is_uptrend = first_close > first_open
    trend = "Up" if is_uptrend else "Down"
    
    max_high_after = None
    max_low_after = None
    upward_move = 0.0
    downward_move = 0.0
    
    # If Uptrend, calculate how much further it goes up
    if len(group) > 1:
        # Get all candles after the first one
        remaining_candles = group.iloc[second_index + 1:]
        
        # Find the max high of the remaining day
        max_high_after = remaining_candles['Close'].max()
        min_low_after = remaining_candles['Close'].min()
        
        # Calculate the absolute upward move from the first candle's close
        upward_move = max_high_after - first_close
        downward_move = min_low_after - first_close



    results.append({
        'Date': date,
        'First_Candle_Trend': trend,
        'First_Close': first_close,
        'Remaining_Day_High': max_high_after,
        'Remaining_Day_Low': min_low_after,
        'Additional_Upward_Move': round(upward_move, 2),
        'Additional_Downward_Move': round(downward_move, 2)
    })

# 4. Convert results to a DataFrame for easy viewing
results_df = pd.DataFrame(results)
print(results_df)

# 1. Filter the DataFrame for days where the first candle was 'Up'
up_trend_df = results_df[results_df['First_Candle_Trend'] == 'Up']

# 2. Calculate Min and Max for the Additional Upward Move
max_upward_push = up_trend_df['Additional_Upward_Move'].max()
min_upward_push = up_trend_df['Additional_Upward_Move'].min()

# 3. Calculate Min and Max for the Additional Downward Move (Drawdown)
# Note: Since drawdowns are negative, min() is the largest drop, and max() is the smallest drop.
worst_drawdown = up_trend_df['Additional_Downward_Move'].min()
least_drawdown = up_trend_df['Additional_Downward_Move'].max()

# Print the results
print(f"--- UP TREND DAYS ANALYSIS ({len(up_trend_df)} days) ---")
print(f"Largest Upward Move:  +{max_upward_push}")
print(f"Smallest Upward Move: +{min_upward_push}")
print(f"Worst Drawdown:       {worst_drawdown}")
print(f"Smallest Drawdown:    {least_drawdown}")

# df2, c, start, end = fetch_option_history(strike=24100)
# print(df2, c, start, end)

if __name__ == "__main__":
    pass

    

