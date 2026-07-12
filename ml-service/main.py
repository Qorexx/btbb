from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import uvicorn
import logging

from model import predict_city, load_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Beyond the Black Box - ML Service")

class PredictionRequest(BaseModel):
    city_id: str
    current_weather: Dict[str, Any]
    cached_history: Optional[List[Dict[str, Any]]] = None

@app.on_event("startup")
async def startup_event():
    """Load the XGBoost model into memory when the server starts."""
    try:
        load_model()
    except Exception as e:
        logger.error(f"Failed to load model on startup: {e}")

@app.post("/predict")
async def predict_outage_risk(req: PredictionRequest):
    """
    Main endpoint for Convex to call. 
    Accepts current weather + history, returns risk score and explanation.
    """
    try:
        result = predict_city(req.city_id, req.current_weather, req.cached_history)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
    except Exception as e:
        logger.error(f"Prediction error for {req.city_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
