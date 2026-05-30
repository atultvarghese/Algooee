import math

import pandas as pd
# pyrefly: ignore [missing-import]
import pytest

# pyrefly: ignore [missing-import]
from core.prediction import Prediction


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "Timestamp": ["2025-08-05 09:15:00", "2025-08-05 09:16:00"],
            "Open": [100, 101],
            "High": [102, 103],
            "Low": [99, 100],
            "Close": [101, 102],
            "Volume": [1000, 1500],
        }
    )


def test_feature_engineering(sample_df):
    model = Prediction(sample_df)
    model.feature_engineering()

    # Check that features exists
    assert hasattr(model, "features")

    # Check that features is a non-empty list
    assert isinstance(model.features, list)
    assert len(model.features) > 0

    # Optionally: check some expected feature names
    expected_features = ["Return", "LogReturn", "Range", "Body"]
    for f in expected_features:
        assert f in model.features


def test_train_model_raises_without_features(sample_df):
    model = Prediction(sample_df)
    # Simulate no features engineered
    model.features = []

    with pytest.raises(
        ValueError, match="Features not prepared. Call feature_engineering\\(\\) first."
    ):
        model.train_model()


def test_train_model_builds_walk_forward_backtest():
    rows = 180
    timestamps = pd.bdate_range("2025-01-01", periods=rows)
    idx = pd.Series(range(rows), dtype=float)
    close = 100 + idx * 0.18 + (idx / 4).apply(lambda x: 2.2 * math.sin(x))
    open_ = close.shift(1).fillna(close.iloc[0]) + 0.15
    high = pd.concat([open_, close], axis=1).max(axis=1) + 1.1 + (idx % 5) * 0.08
    low = pd.concat([open_, close], axis=1).min(axis=1) - 1.0 - (idx % 3) * 0.05
    volume = 100000 + idx * 120
    df = pd.DataFrame(
        {
            "Timestamp": timestamps,
            "Open": open_,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
            "Open Interest": 0,
        }
    )

    model = Prediction(df)
    model.feature_engineering()
    model.train_model(backtest_points=12)
    forecast = model.predict_next_day()
    backtest = model.get_backtest_points(limit=20)
    summary = model.get_backtest_summary()
    diagnostics = model.get_diagnostics()
    signal = model.get_signal_snapshot(forecast)

    assert len(backtest) == 12
    assert forecast["p10"] <= forecast["p90"]
    assert summary["rows"] == 12
    assert summary["mae"] >= 0
    assert 0 <= summary["directional_accuracy"] <= 100
    assert 0 <= summary["interval_coverage"] <= 100
    assert abs(sum(diagnostics["model_weights"].values()) - 1.0) < 1e-6
    assert diagnostics["training_rows"] >= 80
    assert signal["trend"] in {"Bullish", "Bearish", "Neutral"}
    assert 0 <= signal["riskScore"] <= 100
