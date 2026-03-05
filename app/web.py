from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
from app.app import UpstoxClient
from core.prediction import Prediction

app = FastAPI(
    title="Algooee API",
    description="Stock prediction and analysis API",
    version="1.0.0"
)

# Allow the frontend dev servers to access this API (Vite default ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class StockPredictionRequest(BaseModel):
    isin: str
    start_date: str
    end_date: str
    interval: str = "day"
    count: int = 1

class HistoricalCandleResponse(BaseModel):
    isin: str
    data: List[List]
    timestamp: str

class PredictionResponse(BaseModel):
    isin: str
    predicted_high: float
    confidence: str

# Initialize client
try:
    client = UpstoxClient()
except ValueError as e:
    client = None

# API Routes
@app.get("/", tags=["UI"])
async def root():
    """Root endpoint – UI removed, API only."""
    return {"message": "This server provides the Algooee API. Frontend moved to a separate React/Vite application."}

@app.get("/health", tags=["Health"])
async def health():
    """Health status check"""
    return {
        "status": "healthy",
        "api_configured": client is not None
    }

@app.post("/api/historical-candles", tags=["Stock Data"], response_model=HistoricalCandleResponse)
async def get_historical_candles(request: StockPredictionRequest):
    """
    Fetch historical candle data for a stock.
    
    Args:
        isin: Instrument ISIN code (e.g., INE002A01018 for Reliance)
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        interval: Candle interval (day, month, etc.)
        count: Number of intervals per candle
    
    Returns:
        Historical candle data with timestamp, open, high, low, close, volume, open interest
    """
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Upstox API client not configured. Set UPSTOX_API_TOKEN in .env"
        )
    
    try:
        candles = client.get_historical_candles(
            isin=request.isin,
            start_date=request.start_date,
            end_date=request.end_date,
            interval=request.interval,
            count=request.count
        )
        return HistoricalCandleResponse(
            isin=request.isin,
            data=candles,
            timestamp=request.end_date
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error fetching candles: {str(e)}"
        )

@app.post("/api/predict", tags=["Predictions"])
async def predict_stock(request: StockPredictionRequest):
    """
    Predict the next day's high price for a stock.
    
    Args:
        isin: Instrument ISIN code
        start_date: Start date for historical data
        end_date: End date for historical data
        interval: Data interval (default: day)
        count: Number of intervals (default: 1)
    
    Returns:
        Predicted high price and confidence level
    """
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Upstox API client not configured"
        )
    
    try:
        # Fetch historical data
        candles = client.get_historical_candles(
            isin=request.isin,
            start_date=request.start_date,
            end_date=request.end_date,
            interval=request.interval,
            count=request.count
        )
        
        if not candles:
            raise HTTPException(
                status_code=404,
                detail="No data found for the given ISIN and date range"
            )
        
        # Prepare data
        headers = ["Timestamp", "Open", "High", "Low", "Close", "Volume", "Open Interest"]
        df = pd.DataFrame(candles, columns=headers)
        
        # Train model and predict
        predictor = Prediction(df)
        predictor.feature_engineering()
        predictor.train_model()
        predicted_high = predictor.predict_next_day()
        
        return PredictionResponse(
            isin=request.isin,
            predicted_high=float(predicted_high),
            confidence="high" if predicted_high > 0 else "moderate"
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Prediction error: {str(e)}"
        )

@app.get("/api/stocks", tags=["Reference"])
async def get_stock_list():
    """Get list of supported stocks with their ISINs"""
    stocks = {
        "stocks": [
            {"name": "Trident", "isin": "INE064C01022"},
            {"name": "NIFTYBEES", "isin": "INF204KB14I2"},
            {"name": "Bharti Airtel", "isin": "INE397D01024"},
            {"name": "TCS", "isin": "INE467B01029"},
            {"name": "ICICI Bank", "isin": "INE090A01021"},
            {"name": "State Bank of India", "isin": "INE062A01020"},
            {"name": "Infosys", "isin": "INE009A01021"},
            {"name": "Hindustan Unilever", "isin": "INE030A01027"},
            {"name": "ITC", "isin": "INE154A01025"},
            {"name": "Mahindra & Mahindra", "isin": "INE101A01026"},
            {"name": "Kotak Mahindra Bank", "isin": "INE237A01028"},
            {"name": "HCL Technologies", "isin": "INE860A01027"},
            {"name": "Sun Pharma", "isin": "INE044A01036"},
            {"name": "Axis Bank", "isin": "INE238A01034"},
            {"name": "UltraTech Cement", "isin": "INE481G01011"},
            {"name": "Asian Paints", "isin": "INE021A01026"},
            {"name": "Tata Steel", "isin": "INE081A01020"},
            {"name": "Adani Enterprises", "isin": "INE423A01024"},
            {"name": "Adani Ports", "isin": "INE742F01042"},
        ]
    }
    return stocks
