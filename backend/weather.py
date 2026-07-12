"""
weather.py — Fetches live weather data from the Open-Meteo API.
Handles both current conditions and 48-hour forecast for any city.
No API key needed — Open-Meteo is free and open-source.
"""

import requests
import logging
from datetime import datetime, timezone, timedelta
from config import OPEN_METEO_URL, WEATHER_VARS

logger = logging.getLogger(__name__)

# Indian Standard Time offset
IST = timezone(timedelta(hours=5, minutes=30))


def fetch_weather(lat: float, lon: float, forecast_days: int = 2) -> dict:
    """
    Fetch hourly weather data from Open-Meteo for a given coordinate.
    
    Returns a dict with:
      - "current": dict of current-hour weather values
      - "hourly": list of dicts (one per hour, up to 48h forecast)
      - "timestamps": list of ISO timestamp strings
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(WEATHER_VARS),
        "forecast_days": forecast_days,
        "timezone": "Asia/Kolkata",
    }
    
    try:
        response = requests.get(OPEN_METEO_URL, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Open-Meteo API request failed: {e}")
        return None
    
    hourly = data.get("hourly", {})
    timestamps = hourly.get("time", [])
    
    if not timestamps:
        logger.error("No weather data returned from Open-Meteo")
        return None
    
    # Build list of hourly weather dicts
    hourly_data = []
    for i in range(len(timestamps)):
        row = {"timestamp": timestamps[i]}
        for var in WEATHER_VARS:
            value = hourly.get(var, [])
            row[var] = value[i] if i < len(value) else None
        hourly_data.append(row)
    
    # Find the current hour's data
    now = datetime.now(IST)
    current_hour_str = now.strftime("%Y-%m-%dT%H:00")
    
    current = None
    for row in hourly_data:
        if row["timestamp"] == current_hour_str:
            current = row.copy()
            break
    
    # Fallback: use the first available row if exact match not found
    if current is None and hourly_data:
        # Find the closest past hour
        for row in reversed(hourly_data):
            if row["timestamp"] <= current_hour_str:
                current = row.copy()
                break
        # If all hours are in the future, use the first one
        if current is None:
            current = hourly_data[0].copy()
    
    return {
        "current": current,
        "hourly": hourly_data,
        "timestamps": timestamps,
    }


def get_forecast_hours(weather_data: dict) -> list:
    """
    Extract future hours from weather data for forecast endpoint.
    Returns list of hourly weather dicts for hours AFTER the current time.
    """
    if not weather_data or not weather_data.get("hourly"):
        return []
    
    now = datetime.now(IST)
    current_hour_str = now.strftime("%Y-%m-%dT%H:00")
    
    future_hours = []
    for row in weather_data["hourly"]:
        if row["timestamp"] > current_hour_str:
            future_hours.append(row)
    
    return future_hours

def fetch_historical_weather(lat: float, lon: float, target_time_str: str) -> dict:
    """
    Fetch weather data for a specific past date and time for Demo Mode.
    Uses Open-Meteo Archive API or Forecast API depending on date.
    Returns similar structure to fetch_weather.
    """
    try:
        target_dt = datetime.fromisoformat(target_time_str)
        # Ensure it has timezone, or assume IST
        if target_dt.tzinfo is None:
            target_dt = target_dt.replace(tzinfo=IST)
    except ValueError:
        logger.error(f"Invalid target_time format: {target_time_str}")
        return None
        
    now = datetime.now(IST)
    days_ago = (now - target_dt).days
    
    start_date = (target_dt - timedelta(days=2)).strftime("%Y-%m-%d")
    end_date = (target_dt + timedelta(days=2)).strftime("%Y-%m-%d")
    
    # If within 90 days, we can use the regular forecast API with past_days
    if 0 <= days_ago <= 90:
        url = OPEN_METEO_URL
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": ",".join(WEATHER_VARS),
            "past_days": days_ago + 2,
            "forecast_days": 2,
            "timezone": "Asia/Kolkata",
        }
    else:
        # For older dates, use the archive API
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start_date,
            "end_date": end_date,
            "hourly": ",".join(WEATHER_VARS),
            "timezone": "Asia/Kolkata",
        }
        
    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Open-Meteo Archive API request failed: {e}")
        return None
        
    hourly = data.get("hourly", {})
    timestamps = hourly.get("time", [])
    
    if not timestamps:
        logger.error("No historical weather data returned")
        return None
        
    hourly_data = []
    for i in range(len(timestamps)):
        row = {"timestamp": timestamps[i]}
        for var in WEATHER_VARS:
            value = hourly.get(var, [])
            row[var] = value[i] if i < len(value) else None
        hourly_data.append(row)
        
    # Find the target hour's data and index
    target_hour_str = target_dt.strftime("%Y-%m-%dT%H:00")
    
    current = None
    target_idx = -1
    for idx, row in enumerate(hourly_data):
        if row["timestamp"] == target_hour_str:
            current = row.copy()
            target_idx = idx
            break
            
    if current is None and hourly_data:
        # Fallback to closest hour
        for idx, row in reversed(list(enumerate(hourly_data))):
            if row["timestamp"] <= target_hour_str:
                current = row.copy()
                target_idx = idx
                break
        if current is None:
            current = hourly_data[0].copy()
            target_idx = 0
            
    # Extract exact 24h history and 48h forecast relative to target_idx
    # history: [target_idx - 23 : target_idx + 1] -> 24 items ending at target_idx
    start_hist = max(0, target_idx - 23)
    history = hourly_data[start_hist : target_idx + 1]
    
    # forecast: [target_idx + 1 : target_idx + 49] -> next 48 items
    forecast = hourly_data[target_idx + 1 : target_idx + 49]
            
    return {
        "current": current,
        "history": history,
        "forecast": forecast,
        "timestamps": timestamps,
        "is_historical": True
    }
