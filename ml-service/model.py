"""
model.py — ML model loading, feature engineering, and prediction.
This takes raw weather data, engineers the exact 26 features the XGBoost model expects, 
runs prediction, and applies rain hazard + infrastructure fragility adjustments.
"""

import os
import logging
import numpy as np
import xgboost as xgb
from datetime import datetime, timezone, timedelta

from config import FEATURES_V2, STORM_CODES, SUMMER_MONTHS, MONSOON_MONTHS, PEAK_HOURS, CITIES
from explainability import generate_explanation

logger = logging.getLogger(__name__)

# Indian Standard Time
IST = timezone(timedelta(hours=5, minutes=30))

# ── Global model instance (loaded once at startup, stays in memory) ──
_model = None

def load_model():
    """Load the XGBoost model from disk into memory."""
    global _model
    model_path = os.path.join(os.path.dirname(__file__), "..", "models", "xgboost_model_v2.json")
    model_path = os.path.abspath(model_path)

    if not os.path.exists(model_path):
        logger.error(f"Model file not found at {model_path}")
        raise FileNotFoundError(f"Model not found: {model_path}")

    _model = xgb.XGBClassifier()
    _model.load_model(model_path)
    logger.info(f"XGBoost model loaded from {model_path}")
    return _model

def get_model():
    """Get the loaded model, loading it if necessary."""
    global _model
    if _model is None:
        load_model()
    return _model

# ── Heat Index calculation (Steadman's formula) ──
def calculate_heat_index(temp_c: float, rh: float) -> float:
    T = (temp_c * 9 / 5) + 32  # Convert to Fahrenheit
    HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (rh * 0.094))

    if HI >= 80:
        HI = (
            -42.379 + 2.04901523 * T + 10.14333127 * rh
            - 0.22475541 * T * rh - 0.00683783 * T * T
            - 0.05481717 * rh * rh + 0.00122874 * T * T * rh
            + 0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh
        )

    if T < 40:
        HI = T

    return (HI - 32) * 5 / 9  # Convert back to Celsius

# ── Risk classification ──
def classify_risk(probability: float) -> str:
    if probability >= 70:
        return "CRITICAL"
    elif probability >= 50:
        return "HIGH"
    elif probability >= 30:
        return "MODERATE"
    else:
        return "LOW"

# ── Rain hazard adjustment ──
def apply_rain_adjustment(risk: float, precipitation: float, wind_speed: float) -> tuple:
    adjusted = risk
    applied = False

    if precipitation > 10:
        adjusted *= 1.50
        applied = True
    elif precipitation > 5 and wind_speed > 15:
        adjusted *= 1.40
        applied = True
    elif precipitation > 2:
        adjusted *= 1.10
        applied = True

    return (min(adjusted, 99.9), applied)

# ── Fragility adjustment ──
def apply_fragility(risk: float, fragility_score: float) -> float:
    return min(risk * fragility_score, 99.9)

# ── Feature engineering for a single weather row ──
def engineer_features_single(weather: dict, cached_history: list = None) -> dict:
    ts_str = weather.get("timestamp", "")
    if isinstance(ts_str, int):
        # Handle Convex timestamp (ms since epoch)
        ts = datetime.fromtimestamp(ts_str / 1000, tz=IST)
    else:
        try:
            ts = datetime.fromisoformat(ts_str)
        except (ValueError, TypeError):
            ts = datetime.now(IST)

    temp = weather.get("temperature_2m") or 0
    rh = weather.get("relative_humidity_2m") or 0
    precip = weather.get("precipitation") or 0
    wind = weather.get("wind_speed_10m") or 0
    cloud = weather.get("cloud_cover") or 0
    pressure = weather.get("surface_pressure") or 1013
    gusts = weather.get("wind_gusts_10m") or 0
    dewpoint = weather.get("dewpoint_2m") or 0
    radiation = weather.get("shortwave_radiation") or 0
    wcode = weather.get("weather_code") or 0

    hour = ts.hour
    dow = ts.weekday()
    month = ts.month

    is_summer = 1 if month in SUMMER_MONTHS else 0
    is_monsoon = 1 if month in MONSOON_MONTHS else 0
    is_peak = 1 if hour in PEAK_HOURS else 0
    is_storm = 1 if int(wcode) in STORM_CODES else 0

    heat_idx = calculate_heat_index(temp, rh)
    gust_ratio = gusts / wind if wind > 0 else 0
    dp_depression = temp - dewpoint
    temp_x_hum = temp * rh / 100
    rain_x_wind = precip * wind

    rolling_avg_24 = temp
    rolling_max_24 = temp
    temp_change_3 = 0
    pressure_change_3 = 0
    consec_hot = 1 if temp > 35 else 0

    if cached_history and len(cached_history) > 0:
        temps = [h.get("temperature_2m", temp) for h in cached_history] + [temp]
        pressures = [h.get("surface_pressure", pressure) for h in cached_history] + [pressure]

        last_24_temps = temps[-24:] if len(temps) >= 24 else temps
        rolling_avg_24 = sum(last_24_temps) / len(last_24_temps)
        rolling_max_24 = max(last_24_temps)

        if len(temps) >= 4:
            temp_change_3 = temps[-1] - temps[-4]
        if len(pressures) >= 4:
            pressure_change_3 = pressures[-1] - pressures[-4]

        count = 0
        for t in reversed(temps):
            if t and t > 35:
                count += 1
            else:
                break
        consec_hot = count

    features = {
        "temperature_2m": temp,
        "relative_humidity_2m": rh,
        "precipitation": precip,
        "wind_speed_10m": wind,
        "cloud_cover": cloud,
        "surface_pressure": pressure,
        "wind_gusts_10m": gusts,
        "dewpoint_2m": dewpoint,
        "shortwave_radiation": radiation,
        "hour_of_day": hour,
        "day_of_week": dow,
        "month": month,
        "is_summer": is_summer,
        "is_monsoon": is_monsoon,
        "is_peak_hour": is_peak,
        "is_thunderstorm": is_storm,
        "heat_index": heat_idx,
        "gust_ratio": gust_ratio,
        "dewpoint_depression": dp_depression,
        "temp_x_humidity": temp_x_hum,
        "rain_x_wind": rain_x_wind,
        "rolling_avg_temp_24h": rolling_avg_24,
        "rolling_max_temp_24h": rolling_max_24,
        "temp_change_3h": temp_change_3,
        "pressure_change_3h": pressure_change_3,
        "consecutive_hot_hours": consec_hot,
    }
    return features

# ── Run prediction on a single feature set ──
def predict_risk(features: dict) -> float:
    model = get_model()
    feature_values = [features[f] for f in FEATURES_V2]
    X = np.array([feature_values], dtype=np.float64)
    proba = model.predict_proba(X)[0][1]
    return float(round(proba * 100, 1))

# ── Full prediction pipeline for a city ──
def predict_city(city_id: str, weather: dict, cached_history: list = None) -> dict:
    city = CITIES.get(city_id)
    if not city:
        return {"error": f"Unknown city: {city_id}"}

    features = engineer_features_single(weather, cached_history)
    raw_risk = predict_risk(features)
    
    precip = weather.get("precipitation") or 0
    wind = weather.get("wind_speed_10m") or 0
    risk_after_rain, rain_applied = apply_rain_adjustment(raw_risk, precip, wind)

    adjusted_risk = apply_fragility(risk_after_rain, city["fragility"])
    adjusted_risk = round(adjusted_risk, 1)
    risk_level = classify_risk(adjusted_risk)

    explanation = generate_explanation(
        weather_data=features,
        adjusted_risk=adjusted_risk,
        risk_level=risk_level,
        city_name=city["name"],
        discom=city["discom"],
        fragility=city["fragility"],
        rain_adjustment_applied=rain_applied
    )

    return {
        "city_id": city_id,
        "raw_risk": raw_risk,
        "adjusted_risk": adjusted_risk,
        "risk_level": risk_level,
        "rain_adjustment_applied": rain_applied,
        "features": features,
        "explanation": explanation
    }
