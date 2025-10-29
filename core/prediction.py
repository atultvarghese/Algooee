import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt

class Prediction:

    def __init__(self, df):
        df['Timestamp'] = pd.to_datetime(df['Timestamp'])
        df.sort_values('Timestamp', inplace=True)
        self.df = df
        self.model = RandomForestRegressor(n_estimators=100, random_state=42)

    def feature_engineering(self):
        """Create lag and rolling features."""
        df = self.df.copy()

        # Basic features
        df['Return'] = df['Close'].pct_change()
        df['SMA_5'] = df['Close'].rolling(5).mean()
        df['SMA_10'] = df['Close'].rolling(10).mean()
        df['Volatility_5'] = df['Close'].rolling(5).std()
        df['Prev_High'] = df['High'].shift(1)
        df['Prev_Close'] = df['Close'].shift(1)

        # Target variable — next day’s High
        df['Target_High'] = df['High'].shift(-1)

        df.dropna(inplace=True)
        self.df = df

    def train_model(self):
        """Train regression model."""
        features = ['Prev_High', 'Prev_Close', 'Return', 'SMA_5', 'SMA_10', 'Volatility_5']
        X = self.df[features]
        y = self.df['Target_High']

        X_train, X_test, y_train, y_test = train_test_split(X, y, shuffle=False, test_size=0.2)
        self.model.fit(X_train, y_train)
        preds = self.model.predict(X_test)
        mae = mean_absolute_error(y_test, preds)

        print(f"Model trained ✅ | MAE: {mae:.4f}")
        return X_test, y_test, preds

    def predict_next_day(self):
        """Predict next day's High using latest data."""
        features = ['Prev_High', 'Prev_Close', 'Return', 'SMA_5', 'SMA_10', 'Volatility_5']
        latest = self.df.iloc[-1:][features]
        next_high = self.model.predict(latest)[0]
        print(f"📈 Predicted Next Day High: {next_high:.2f}")
        return next_high

    def plot_results(self, y_test, preds):
        """Visualize actual vs predicted highs."""
        plt.figure(figsize=(10, 5))
        plt.plot(y_test.values, label='Actual High')
        plt.plot(preds, label='Predicted High')
        plt.legend()
        plt.title("Next Day High Prediction")
        plt.show()