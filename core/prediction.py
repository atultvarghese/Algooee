import math

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


class Prediction:
    """Robust next-candle high forecaster with walk-forward backtest diagnostics."""

    def __init__(self, df):
        df = df.copy()
        df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
        numeric_cols = ["Open", "High", "Low", "Close", "Volume", "Open Interest"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        df.dropna(subset=["Timestamp", "Open", "High", "Low", "Close"], inplace=True)
        df.sort_values("Timestamp", inplace=True)

        self.raw_df = df.copy()
        self.df = df
        self.features = []
        self.models = []
        self.model_weights = {}
        self.last_mae = None
        self.last_mape = None
        self.last_rmse = None
        self.last_bias = None
        self.directional_accuracy = None
        self.interval_coverage = None
        self.residual_quantiles = {"p10": None, "p90": None, "abs_p80": None}
        self.backtest_summary = {}
        self.diagnostics = {}
        self.backtest_df = pd.DataFrame(
            columns=[
                "timestamp",
                "actual_high",
                "predicted_high",
                "p10",
                "p90",
                "abs_error",
                "error_pct",
                "previous_high",
                "directional_hit",
            ]
        )

    @staticmethod
    def _safe_float(value, default=0.0):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return default
        return number if math.isfinite(number) else default

    @staticmethod
    def _clamp(value, low=0.0, high=100.0):
        return max(low, min(high, value))

    @staticmethod
    def _ema(series: pd.Series, span: int) -> pd.Series:
        return series.ewm(span=span, adjust=False).mean()

    @staticmethod
    def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        return (100 - (100 / (1 + rs))).fillna(50.0)

    @staticmethod
    def _compute_feature_columns(df: pd.DataFrame) -> pd.DataFrame:
        """Compute model feature columns on top of raw OHLCV rows."""
        df = df.copy()
        close = df["Close"].astype(float)
        high = df["High"].astype(float)
        low = df["Low"].astype(float)
        open_ = df["Open"].astype(float)
        prev_close = close.shift(1)

        # Price dynamics
        df["Return"] = close.pct_change()
        ratio = close / prev_close
        df["LogReturn"] = np.log(ratio.where(ratio > 0))
        df["Range"] = high - low
        df["Body"] = close - open_
        df["Gap"] = (open_ - prev_close) / prev_close.replace(0, np.nan)
        df["Close_Position"] = (close - low) / (high - low).replace(0, np.nan)
        df["High_to_Close"] = (high - close) / close.replace(0, np.nan)
        df["Low_to_Close"] = (close - low) / close.replace(0, np.nan)

        # Trend/momentum
        df["SMA_5"] = close.rolling(5, min_periods=3).mean()
        df["SMA_10"] = close.rolling(10, min_periods=4).mean()
        df["SMA_20"] = close.rolling(20, min_periods=6).mean()
        df["EMA_12"] = Prediction._ema(close, 12)
        df["EMA_20"] = Prediction._ema(close, 20)
        df["EMA_26"] = Prediction._ema(close, 26)
        df["EMA_50"] = Prediction._ema(close, 50)
        df["MACD"] = df["EMA_12"] - df["EMA_26"]
        df["MACD_Signal"] = Prediction._ema(df["MACD"], 9)
        df["RSI_14"] = Prediction._rsi(close, 14)
        df["Momentum_3"] = close.pct_change(3)
        df["Momentum_5"] = close.pct_change(5)
        df["Momentum_10"] = close.pct_change(10)

        # Volatility
        true_range = pd.concat(
            [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
            axis=1,
        ).max(axis=1)
        df["TrueRange"] = true_range
        df["ATR_14"] = true_range.rolling(14, min_periods=4).mean()
        df["Volatility_5"] = close.rolling(5, min_periods=3).std()
        df["Volatility_10"] = close.rolling(10, min_periods=4).std()
        rolling_std_20 = close.rolling(20, min_periods=6).std()
        df["BB_Width_20"] = (rolling_std_20 * 4) / df["SMA_20"].replace(0, np.nan)
        df["High_Rolling_Max_5"] = high.rolling(5, min_periods=3).max()
        df["Low_Rolling_Min_5"] = low.rolling(5, min_periods=3).min()

        # Calendar feature for daily candles and intraday data alike.
        df["DayOfWeek"] = pd.to_datetime(df["Timestamp"]).dt.dayofweek.astype(float)

        # Volume
        if "Volume" in df.columns:
            vol = df["Volume"].astype(float)
            df["Vol_Change"] = vol.pct_change()
            df["Vol_SMA_10"] = vol.rolling(10, min_periods=4).mean()
            direction = np.sign(close.diff()).fillna(0.0)
            df["OBV"] = (direction * vol.fillna(0.0)).cumsum()

        # Lags
        for lag in (1, 2, 3, 5):
            df[f"Prev_High_{lag}"] = high.shift(lag)
            df[f"Prev_Close_{lag}"] = close.shift(lag)
            df[f"Prev_Open_{lag}"] = open_.shift(lag)
            df[f"Prev_Range_{lag}"] = df["Range"].shift(lag)

        return df.replace([np.inf, -np.inf], np.nan)

    @staticmethod
    def _next_business_day(ts: pd.Timestamp) -> pd.Timestamp:
        next_day = pd.Timestamp(ts) + pd.Timedelta(days=1)
        while next_day.weekday() >= 5:
            next_day += pd.Timedelta(days=1)
        return next_day

    @staticmethod
    def _candidate_models():
        return [
            (
                "boosted_trees",
                HistGradientBoostingRegressor(
                    loss="squared_error",
                    learning_rate=0.055,
                    max_depth=5,
                    max_iter=180,
                    l2_regularization=0.12,
                    random_state=42,
                ),
            ),
            (
                "extra_trees",
                ExtraTreesRegressor(
                    n_estimators=96,
                    min_samples_leaf=3,
                    max_features=0.82,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
            ("ridge_trend", make_pipeline(StandardScaler(), Ridge(alpha=18.0))),
        ]

    @staticmethod
    def _recency_weights(length: int) -> np.ndarray:
        if length <= 1:
            return np.ones(max(length, 1))
        return np.linspace(0.55, 1.0, num=length)

    @staticmethod
    def _fit_model(model, X, y, sample_weight):
        X_values = (
            X.to_numpy(dtype=float) if hasattr(X, "to_numpy") else np.asarray(X, dtype=float)
        )
        y_values = (
            y.to_numpy(dtype=float) if hasattr(y, "to_numpy") else np.asarray(y, dtype=float)
        )
        try:
            model.fit(X_values, y_values, sample_weight=sample_weight)
            return model
        except (TypeError, ValueError):
            if hasattr(model, "named_steps") and "ridge" in model.named_steps:
                model.fit(X_values, y_values, ridge__sample_weight=sample_weight)
                return model
            model.fit(X_values, y_values)
            return model

    def _fit_candidate_models(self, X, y):
        sample_weight = self._recency_weights(len(X))
        fitted = []
        for name, model in self._candidate_models():
            fitted.append((name, self._fit_model(clone(model), X, y, sample_weight)))
        return fitted

    def _predict_with_models(self, fitted_models, X, weights=None):
        X_values = (
            X.to_numpy(dtype=float) if hasattr(X, "to_numpy") else np.asarray(X, dtype=float)
        )
        predictions = []
        model_names = []
        for name, model in fitted_models:
            pred = np.asarray(model.predict(X_values), dtype=float)
            predictions.append(pred)
            model_names.append(name)

        matrix = np.vstack(predictions)
        if weights:
            weight_vector = np.asarray(
                [weights.get(name, 0.0) for name in model_names], dtype=float
            )
            if weight_vector.sum() <= 0:
                weight_vector = np.ones(len(model_names), dtype=float)
        else:
            weight_vector = np.ones(len(model_names), dtype=float)
        weight_vector = weight_vector / weight_vector.sum()
        return np.average(matrix, axis=0, weights=weight_vector)

    def _predict_final(self, X):
        if not self.models:
            raise ValueError("Model not trained. Call train_model() first.")
        return self._predict_with_models(self.models, X, self.model_weights)

    def _latest_feature_row_from_prices(self, price_df: pd.DataFrame):
        if not self.features:
            return None
        enriched = self._compute_feature_columns(price_df)
        if enriched.empty:
            return None
        latest = enriched.iloc[-1]
        values = []
        for feature in self.features:
            val = latest.get(feature, np.nan)
            if pd.isna(val) or not np.isfinite(float(val)):
                return None
            values.append(float(val))
        return pd.DataFrame([values], columns=self.features)

    def _prediction_interval(self, predicted_high: float, multiplier: float = 1.0):
        p10_residual = self.residual_quantiles.get("p10")
        p90_residual = self.residual_quantiles.get("p90")
        abs_p80 = self.residual_quantiles.get("abs_p80")
        min_width = max(
            self._safe_float(abs_p80),
            self._safe_float(self.last_mae),
            abs(predicted_high) * 0.006,
        )

        if p10_residual is None or p90_residual is None:
            p10 = predicted_high - min_width * multiplier
            p90 = predicted_high + min_width * multiplier
        else:
            p10 = predicted_high + self._safe_float(p10_residual) * multiplier
            p90 = predicted_high + self._safe_float(p90_residual) * multiplier
            if p90 - p10 < min_width:
                center = (p10 + p90) / 2
                p10 = center - min_width * multiplier
                p90 = center + min_width * multiplier

        if p10 > p90:
            p10, p90 = p90, p10
        return max(0.0, float(p10)), max(0.0, float(p90))

    def feature_engineering(self):
        """Create lag/rolling + technical features."""
        df = self._compute_feature_columns(self.raw_df)

        # Target variable - next available candle high.
        df["Target_High"] = df["High"].shift(-1)
        df["Target_Timestamp"] = df["Timestamp"].shift(-1)

        candidate_features = [
            "Return",
            "LogReturn",
            "Range",
            "Body",
            "Gap",
            "Close_Position",
            "High_to_Close",
            "Low_to_Close",
            "SMA_5",
            "SMA_10",
            "SMA_20",
            "EMA_12",
            "EMA_20",
            "EMA_26",
            "EMA_50",
            "MACD",
            "MACD_Signal",
            "RSI_14",
            "Momentum_3",
            "Momentum_5",
            "Momentum_10",
            "TrueRange",
            "ATR_14",
            "Volatility_5",
            "Volatility_10",
            "BB_Width_20",
            "High_Rolling_Max_5",
            "Low_Rolling_Min_5",
            "DayOfWeek",
            "Vol_Change",
            "Vol_SMA_10",
            "OBV",
            "Prev_High_1",
            "Prev_Close_1",
            "Prev_Open_1",
            "Prev_Range_1",
            "Prev_High_2",
            "Prev_Close_2",
            "Prev_Open_2",
            "Prev_Range_2",
            "Prev_High_3",
            "Prev_Close_3",
            "Prev_Open_3",
            "Prev_Range_3",
            "Prev_High_5",
            "Prev_Close_5",
            "Prev_Open_5",
            "Prev_Range_5",
        ]
        self.features = [c for c in candidate_features if c in df.columns]
        df.dropna(subset=self.features + ["Target_High", "Target_Timestamp"], inplace=True)
        self.df = df

    def _walk_forward_backtest(self, X, y, backtest_points: int):
        max_points = max(8, min(int(backtest_points or 30), 60))
        min_train_size = max(70, min(int(len(X) * 0.58), len(X) - 8))
        start_idx = max(min_train_size, len(X) - max_points)

        rows = []
        model_errors = {name: [] for name, _ in self._candidate_models()}
        candidate_prediction_rows = []

        for test_idx in range(start_idx, len(X)):
            X_train, y_train = X.iloc[:test_idx], y.iloc[:test_idx]
            X_test = X.iloc[test_idx : test_idx + 1]
            fitted_models = self._fit_candidate_models(X_train, y_train)

            candidate_predictions = {}
            for name, model in fitted_models:
                pred = float(model.predict(X_test.to_numpy(dtype=float))[0])
                candidate_predictions[name] = pred
                model_errors[name].append(abs(float(y.iloc[test_idx]) - pred))

            candidate_prediction_rows.append(candidate_predictions)
            rows.append(
                {
                    "timestamp": self.df["Target_Timestamp"].iloc[test_idx],
                    "actual_high": float(y.iloc[test_idx]),
                    "previous_high": float(self.df["High"].iloc[test_idx]),
                    "naive_high": float(self.df["High"].iloc[test_idx]),
                    "recent_high_mean": float(
                        self.df["High"].iloc[max(0, test_idx - 4) : test_idx + 1].mean()
                    ),
                }
            )

        model_mae = {
            name: float(np.mean(errors)) if errors else float("inf")
            for name, errors in model_errors.items()
        }
        inverse_errors = {
            name: 1.0 / max(error, 1e-8)
            for name, error in model_mae.items()
            if math.isfinite(error)
        }
        total_inverse_error = sum(inverse_errors.values())
        if total_inverse_error <= 0:
            weights = {name: 1.0 / len(model_mae) for name in model_mae}
        else:
            weights = {
                name: inverse_errors.get(name, 0.0) / total_inverse_error for name in model_mae
            }

        for row, candidate_predictions in zip(rows, candidate_prediction_rows):
            row["predicted_high"] = float(
                sum(candidate_predictions[name] * weights.get(name, 0.0) for name in weights)
            )
            row["abs_error"] = abs(row["actual_high"] - row["predicted_high"])
            row["error_pct"] = row["abs_error"] / max(abs(row["actual_high"]), 1e-8) * 100.0
            actual_up = row["actual_high"] >= row["previous_high"]
            predicted_up = row["predicted_high"] >= row["previous_high"]
            row["directional_hit"] = bool(actual_up == predicted_up)

        return pd.DataFrame(rows), model_mae, weights

    def train_model(self, backtest_points: int = 30):
        """Train ensemble and store walk-forward backtest points."""
        if not self.features:
            raise ValueError("Features not prepared. Call feature_engineering() first.")

        X = self.df[self.features]
        y = self.df["Target_High"]

        if len(X) < 80:
            raise ValueError(
                "Not enough data to train model; need at least 80 rows "
                "after feature engineering."
            )

        self.backtest_df, model_mae, weights = self._walk_forward_backtest(
            X, y, backtest_points
        )
        self.model_weights = weights

        if self.backtest_df.empty:
            raise ValueError("Not enough data to build walk-forward backtest.")

        residuals = self.backtest_df["actual_high"].astype(float) - self.backtest_df[
            "predicted_high"
        ].astype(float)
        abs_errors = residuals.abs()
        self.last_mae = float(abs_errors.mean())
        self.last_rmse = float(
            math.sqrt(
                mean_squared_error(
                    self.backtest_df["actual_high"],
                    self.backtest_df["predicted_high"],
                )
            )
        )
        denom = np.maximum(np.abs(self.backtest_df["actual_high"].values.astype(float)), 1e-8)
        self.last_mape = float(np.mean(abs_errors.values.astype(float) / denom) * 100.0)
        self.last_bias = float(residuals.mean())
        self.directional_accuracy = float(self.backtest_df["directional_hit"].mean() * 100.0)
        self.residual_quantiles = {
            "p10": float(np.quantile(residuals, 0.1)),
            "p90": float(np.quantile(residuals, 0.9)),
            "abs_p80": float(np.quantile(abs_errors, 0.8)),
        }

        self.backtest_df["p10"] = self.backtest_df["predicted_high"].apply(
            lambda pred: self._prediction_interval(float(pred))[0]
        )
        self.backtest_df["p90"] = self.backtest_df["predicted_high"].apply(
            lambda pred: self._prediction_interval(float(pred))[1]
        )
        inside_interval = (self.backtest_df["actual_high"] >= self.backtest_df["p10"]) & (
            self.backtest_df["actual_high"] <= self.backtest_df["p90"]
        )
        self.interval_coverage = float(inside_interval.mean() * 100.0)

        naive_mae = float(
            mean_absolute_error(
                self.backtest_df["actual_high"],
                self.backtest_df["naive_high"],
            )
        )
        recent_mean_mae = float(
            mean_absolute_error(
                self.backtest_df["actual_high"],
                self.backtest_df["recent_high_mean"],
            )
        )
        best_baseline_mae = min(naive_mae, recent_mean_mae)
        model_edge_pct = (
            (best_baseline_mae - self.last_mae) / max(best_baseline_mae, 1e-8) * 100.0
        )

        self.models = self._fit_candidate_models(X, y)
        self.backtest_summary = {
            "rows": int(len(self.backtest_df)),
            "mae": self.last_mae,
            "rmse": self.last_rmse,
            "mape": self.last_mape,
            "bias": self.last_bias,
            "directional_accuracy": self.directional_accuracy,
            "interval_coverage": self.interval_coverage,
            "naive_mae": naive_mae,
            "recent_mean_mae": recent_mean_mae,
            "best_baseline_mae": best_baseline_mae,
            "model_edge_pct": float(model_edge_pct),
        }
        self.diagnostics = {
            "raw_rows": int(len(self.raw_df)),
            "training_rows": int(len(X)),
            "features": int(len(self.features)),
            "model_weights": {name: float(weight) for name, weight in weights.items()},
            "model_mae": {name: float(error) for name, error in model_mae.items()},
            "trained_models": [name for name, _ in self.models],
        }

        print(
            "Model trained ✅ | "
            f"MAE: {self.last_mae:.4f} | MAPE: {self.last_mape:.2f}% | "
            f"Edge: {model_edge_pct:.1f}%"
        )
        return X, y, self._predict_final(X)

    def predict_next_day(self):
        """Predict next candle high using latest data and residual-calibrated interval."""
        latest = self._latest_feature_row_from_prices(self.raw_df)
        if latest is None:
            latest = self.df.iloc[-1:][self.features]
        next_high = float(self._predict_final(latest)[0])
        p10, p90 = self._prediction_interval(next_high)

        result = {
            "predicted_high": next_high,
            "p10": p10,
            "p90": p90,
            "mae": float(self.last_mae or 0.0),
            "mape": float(self.last_mape or 0.0),
            "rmse": float(self.last_rmse or 0.0),
            "bias": float(self.last_bias or 0.0),
        }
        print(
            f"📈 Predicted Next Day High: {result['predicted_high']:.2f} "
            f"(p10={result['p10']:.2f}, p90={result['p90']:.2f})"
        )
        return result

    def predict_future_days(self, days: int = 1):
        """
        Forecast next N trading days by rolling the ensemble forward.
        Uses model outputs to synthesize a conservative candle path for feature updates.
        """
        horizon = max(0, int(days))
        if horizon == 0:
            return []
        if not self.features:
            raise ValueError("Features not prepared. Call feature_engineering() first.")

        required_cols = [
            "Timestamp",
            "Open",
            "High",
            "Low",
            "Close",
            "Volume",
            "Open Interest",
        ]
        available_cols = [col for col in required_cols if col in self.raw_df.columns]
        sim_df = (
            self.raw_df[available_cols].copy().sort_values("Timestamp").reset_index(drop=True)
        )
        if sim_df.empty:
            return []

        for col in required_cols:
            if col not in sim_df.columns:
                sim_df[col] = 0.0 if col not in ["Timestamp"] else pd.NaT

        forecasts = []
        base_mae = float(self.last_mae or 0.0)

        for step in range(1, horizon + 1):
            latest_features = self._latest_feature_row_from_prices(sim_df)
            if latest_features is None:
                break

            predicted_high = float(self._predict_final(latest_features)[0])
            p10, p90 = self._prediction_interval(
                predicted_high,
                multiplier=1.0 + 0.25 * (step - 1),
            )

            prev = sim_df.iloc[-1]
            next_ts = self._next_business_day(prev["Timestamp"])
            forecasts.append(
                {
                    "timestamp": next_ts.strftime("%Y-%m-%d"),
                    "predicted_high": float(predicted_high),
                    "p10": float(p10),
                    "p90": float(p90),
                    "step": step,
                }
            )

            # Synthesize a plausible next candle so step+1 can be predicted recursively.
            last_close = float(prev["Close"])
            last_high = float(prev["High"])
            last_low = float(prev["Low"])
            last_range = max(last_high - last_low, 0.0)
            move = predicted_high - last_close

            next_open = max(0.0, last_close)
            next_close = max(0.0, last_close + 0.35 * move)
            synthetic_range = max(
                last_range * 0.8,
                abs(move) * 0.6,
                max(base_mae, abs(last_close) * 0.002),
            )
            next_low = max(
                0.0, min(next_open, next_close, predicted_high) - 0.35 * synthetic_range
            )
            next_high = max(predicted_high, next_open, next_close, next_low)
            next_volume = float(prev.get("Volume", 0.0))
            next_oi = float(prev.get("Open Interest", 0.0))

            sim_df.loc[len(sim_df)] = {
                "Timestamp": next_ts,
                "Open": next_open,
                "High": next_high,
                "Low": next_low,
                "Close": next_close,
                "Volume": next_volume,
                "Open Interest": next_oi,
            }

        return forecasts

    def confidence_score(self):
        """Return a 0-100 model confidence score from backtest quality."""
        if not self.backtest_summary:
            return 0.0

        mape_score = self._clamp(100.0 - self._safe_float(self.last_mape) * 8.0)
        edge_score = self._clamp(
            50.0 + self._safe_float(self.backtest_summary.get("model_edge_pct"))
        )
        direction_score = self._clamp(self._safe_float(self.directional_accuracy))
        coverage = self._safe_float(self.interval_coverage)
        coverage_score = self._clamp(100.0 - abs(coverage - 80.0) * 1.5)
        data_score = self._clamp(
            self._safe_float(self.diagnostics.get("training_rows")) / 250.0 * 100.0
        )

        return float(
            0.34 * mape_score
            + 0.26 * edge_score
            + 0.18 * direction_score
            + 0.12 * coverage_score
            + 0.10 * data_score
        )

    def get_signal_snapshot(self, forecast=None):
        """Return latest trend, risk and indicator values for the frontend."""
        enriched = self._compute_feature_columns(self.raw_df)
        if enriched.empty:
            return {}

        latest = enriched.iloc[-1]
        close = self._safe_float(latest.get("Close"))
        predicted_high = self._safe_float(
            (forecast or {}).get("predicted_high"),
            default=close,
        )
        expected_move_pct = (
            (predicted_high - close) / max(abs(close), 1e-8) * 100.0 if close else 0.0
        )
        ema20 = self._safe_float(latest.get("EMA_20"), close)
        ema50 = self._safe_float(latest.get("EMA_50"), close)
        macd = self._safe_float(latest.get("MACD"))
        rsi = self._safe_float(latest.get("RSI_14"), 50.0)

        trend_points = 0
        trend_points += 1 if close >= ema20 else -1
        trend_points += 1 if ema20 >= ema50 else -1
        trend_points += 1 if macd >= 0 else -1
        trend_points += 1 if expected_move_pct >= 0 else -1
        if trend_points >= 2:
            trend = "Bullish"
        elif trend_points <= -2:
            trend = "Bearish"
        else:
            trend = "Neutral"
        trend_strength = self._clamp(
            50.0 + abs(trend_points) * 10.0 + abs(expected_move_pct) * 2.0
        )

        atr_pct = self._safe_float(latest.get("ATR_14")) / max(abs(close), 1e-8) * 100.0
        interval_width_pct = 0.0
        if forecast:
            p10 = self._safe_float(forecast.get("p10"), predicted_high)
            p90 = self._safe_float(forecast.get("p90"), predicted_high)
            interval_width_pct = abs(p90 - p10) / max(abs(predicted_high), 1e-8) * 100.0
        risk_score = self._clamp(
            12.0
            + atr_pct * 8.0
            + self._safe_float(self.last_mape) * 3.5
            + interval_width_pct * 2.0
            - max(self._safe_float(self.backtest_summary.get("model_edge_pct")), 0.0) * 0.18
        )

        return {
            "trend": trend,
            "trendStrength": float(trend_strength),
            "riskScore": float(risk_score),
            "rsi": float(rsi),
            "macd": float(macd),
            "ema20": float(ema20),
            "ema50": float(ema50),
            "volume": float(self._safe_float(latest.get("Volume"))),
            "expectedMovePct": float(expected_move_pct),
        }

    def get_backtest_points(self, limit: int = 15):
        """Return recent backtest points (actual vs predicted) as JSON-friendly rows."""
        if self.backtest_df.empty:
            return []

        backtest = self.backtest_df.sort_values("timestamp").tail(limit).copy()
        backtest["timestamp"] = pd.to_datetime(backtest["timestamp"]).dt.strftime("%Y-%m-%d")
        return [
            {
                "timestamp": row["timestamp"],
                "actual_high": float(row["actual_high"]),
                "predicted_high": float(row["predicted_high"]),
                "p10": float(row["p10"]),
                "p90": float(row["p90"]),
                "abs_error": float(row["abs_error"]),
                "error_pct": float(row["error_pct"]),
                "previous_high": float(row["previous_high"]),
                "directional_hit": bool(row["directional_hit"]),
            }
            for _, row in backtest.iterrows()
        ]

    def get_backtest_summary(self):
        """Return aggregate walk-forward metrics."""
        return {
            key: float(value) if isinstance(value, (np.floating, float)) else value
            for key, value in self.backtest_summary.items()
        }

    def get_diagnostics(self):
        """Return model internals that help explain the forecast quality."""
        return self.diagnostics.copy()

    def plot_results(self, y_test, preds):
        """Visualize actual vs predicted highs."""
        plt.figure(figsize=(10, 5))
        plt.plot(y_test.values, label="Actual High")
        plt.plot(preds, label="Predicted High")
        plt.legend()
        plt.title("Next Day High Prediction")
        plt.show()
