"""
FastAPI server entry point for Algooee application
Run with: uvicorn server:app --reload
"""

import uvicorn
from app.web import app

if __name__ == "__main__":
    uvicorn.run(
        "app.web:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
