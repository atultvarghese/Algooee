import pandas as pd
import pytest
from core.prediction import Prediction

@pytest.fixture
def sample_df():
    return pd.DataFrame({
        "Timestamp": ["2025-08-05 09:15:00", "2025-08-05 09:16:00"],
        "Open": [100, 101],
        "High": [102, 103],
        "Low": [99, 100],
        "Close": [101, 102],
        "Volume": [1000, 1500],
    })

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

    with pytest.raises(ValueError, match="Features not prepared. Call feature_engineering\\(\\) first."):
        model.train_model()