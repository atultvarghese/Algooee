"""
FastAPI server entry point for Algooee application
Run with: uvicorn server:app --reload
"""

import uvicorn

# pyrefly: ignore [missing-import]
from app.web import app

__all__ = ["app"]

if __name__ == "__main__":
    import sys
    frozen = getattr(sys, "frozen", False)
    if frozen:
        # Disable reload and use app object directly under frozen environments
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    else:
        uvicorn.run("app.web:app", host="0.0.0.0", port=8000, reload=True, log_level="info")

