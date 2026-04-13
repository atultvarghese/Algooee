from fastapi.testclient import TestClient

from app.web import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_prediction_endpoint_requires_token():
    # Prepare a sample request payload
    payload = {
        "isin": "INE123A01011",
        "start_date": "2025-08-05",
        "end_date": "2025-08-05",
        "interval": "day",
        "count": 1,
    }

    # Call the POST endpoint
    response = client.post("/api/predict", json=payload)

    # Since we don't have an Upstox token, we expect a 503
    assert response.status_code == 503 or response.status_code == 400
