import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
import matplotlib.pyplot as plt

class Prediction:

    def __init__(self, df):
        df = df.copy()
        df['Timestamp'] = pd.to_datetime(df['Timestamp'])
        numeric_cols = ["Open", "High", "Low", "Close", "Volume", "Open Interest"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        df.dropna(subset=["Timestamp", "Open", "High", "Low", "Close"], inplace=True)
        df.sort_values('Timestamp', inplace=True)
        self.df = df
        self.features = []
        self.model = HistGradientBoostingRegressor(
            loss="squared_error",
            learning_rate=0.06,
            max_depth=5,
            max_iter=220,
            l2_regularization=0.1,
            random_state=42,
        )
        self.last_mae = None
        self.last_mape = None
        self.backtest_df = pd.DataFrame(columns=["timestamp", "actual_high", "predicted_high", "abs_error"])

    @staticmethod
    def _ema(series: pd.Series, span: int) -> pd.Series:
        return series.ewm(span=span, adjust=False).mean()

    @staticmethod
    def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.rolling(period).mean()
        avg_loss = loss.rolling(period).mean()
        rs = avg_gain / avg_loss.replace(0, pd.NA)
        return 100 - (100 / (1 + rs))

    def feature_engineering(self):
        """Create lag/rolling + technical features."""
        df = self.df.copy()
        close = df['Close'].astype(float)

        # Price dynamics
        df['Return'] = close.pct_change()
        ratio = close / close.shift(1)
        df['LogReturn'] = np.log(ratio.where(ratio > 0))
        df['Range'] = (df['High'] - df['Low']).astype(float)
        df['Body'] = (df['Close'] - df['Open']).astype(float)

        # Trend/momentum
        df['SMA_5'] = close.rolling(5).mean()
        df['SMA_10'] = close.rolling(10).mean()
        df['SMA_20'] = close.rolling(20).mean()
        df['EMA_12'] = self._ema(close, 12)
        df['EMA_26'] = self._ema(close, 26)
        df['MACD'] = df['EMA_12'] - df['EMA_26']
        df['MACD_Signal'] = self._ema(df['MACD'], 9)
        df['RSI_14'] = self._rsi(close, 14)

        # Volatility
        df['Volatility_5'] = close.rolling(5).std()
        df['Volatility_10'] = close.rolling(10).std()

        # Volume
        if 'Volume' in df.columns:
            vol = df['Volume'].astype(float)
            df['Vol_Change'] = vol.pct_change()
            df['Vol_SMA_10'] = vol.rolling(10).mean()

        # Lags
        for lag in (1, 2, 3):
            df[f'Prev_High_{lag}'] = df['High'].shift(lag)
            df[f'Prev_Close_{lag}'] = df['Close'].shift(lag)
            df[f'Prev_Open_{lag}'] = df['Open'].shift(lag)
            df[f'Prev_Range_{lag}'] = df['Range'].shift(lag)

        # Target variable — next day’s High
        df['Target_High'] = df['High'].shift(-1)
        # Keep the exact target candle date (next available trading candle), not calendar +1 day
        df['Target_Timestamp'] = df['Timestamp'].shift(-1)

        df.dropna(inplace=True)
        self.df = df
        candidate_features = [
            'Return', 'LogReturn', 'Range', 'Body',
            'SMA_5', 'SMA_10', 'SMA_20',
            'EMA_12', 'EMA_26', 'MACD', 'MACD_Signal', 'RSI_14',
            'Volatility_5', 'Volatility_10',
            'Vol_Change', 'Vol_SMA_10',
            'Prev_High_1', 'Prev_Close_1', 'Prev_Open_1', 'Prev_Range_1',
            'Prev_High_2', 'Prev_Close_2', 'Prev_Open_2', 'Prev_Range_2',
            'Prev_High_3', 'Prev_Close_3', 'Prev_Open_3', 'Prev_Range_3',
        ]
        self.features = [c for c in candidate_features if c in self.df.columns]

    def train_model(self):
        """Train regression model and store backtest points from chronological test split."""
        if not self.features:
            raise ValueError("Features not prepared. Call feature_engineering() first.")

        X = self.df[self.features]
        y = self.df['Target_High']

        if len(X) < 80:
            raise ValueError("Not enough data to train model; need at least 80 rows after feature engineering.")

        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        recency_weight = np.linspace(0.6, 1.0, num=len(X_train))
        self.model.fit(X_train, y_train, sample_weight=recency_weight)
        preds = self.model.predict(X_test)
        self.last_mae = float(mean_absolute_error(y_test, preds))
        denom = np.maximum(np.abs(y_test.values.astype(float)), 1e-8)
        self.last_mape = float(np.mean(np.abs((y_test.values.astype(float) - preds.astype(float)) / denom)) * 100.0)

        backtest_timestamps = self.df["Target_Timestamp"].iloc[split_idx:]
        self.backtest_df = pd.DataFrame({
            "timestamp": backtest_timestamps,
            "actual_high": y_test.values.astype(float),
            "predicted_high": preds.astype(float),
        })
        self.backtest_df["abs_error"] = (self.backtest_df["actual_high"] - self.backtest_df["predicted_high"]).abs()

        print(f"Model trained ✅ | MAE: {self.last_mae:.4f} | MAPE: {self.last_mape:.2f}%")
        return X_test, y_test, preds

    def predict_next_day(self):
        """Predict next day's High using latest data + simple interval from MAE."""
        latest = self.df.iloc[-1:][self.features]
        next_high = float(self.model.predict(latest)[0])

        mae = float(self.last_mae or 0.0)
        interval = max(mae, abs(next_high) * 0.006)
        p10 = next_high - interval
        p90 = next_high + interval

        result = {
            "predicted_high": next_high,
            "p10": max(0.0, p10),
            "p90": max(0.0, p90),
            "mae": mae,
            "mape": float(self.last_mape or 0.0),
        }
        print(
            f"📈 Predicted Next Day High: {result['predicted_high']:.2f} "
            f"(p10={result['p10']:.2f}, p90={result['p90']:.2f})"
        )
        return result

    def get_backtest_points(self, limit: int = 15):
        """Return recent backtest points (actual vs predicted) as JSON-friendly rows."""
        if self.backtest_df.empty:
            return []

        backtest = self.backtest_df.sort_values("timestamp").tail(limit).copy()
        backtest["timestamp"] = backtest["timestamp"].dt.strftime("%Y-%m-%d")
        return [
            {
                "timestamp": row["timestamp"],
                "actual_high": float(row["actual_high"]),
                "predicted_high": float(row["predicted_high"]),
                "abs_error": float(row["abs_error"]),
            }
            for _, row in backtest.iterrows()
        ]

    def plot_results(self, y_test, preds):
        """Visualize actual vs predicted highs."""
        plt.figure(figsize=(10, 5))
        plt.plot(y_test.values, label='Actual High')
        plt.plot(preds, label='Predicted High')
        plt.legend()
        plt.title("Next Day High Prediction")
        plt.show()
