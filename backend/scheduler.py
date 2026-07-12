"""
scheduler.py — Background task that auto-refreshes weather + predictions
for all cities every hour. Keeps the data fresh without waiting for
user requests.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
# pyrefly: ignore [missing-import]
from apscheduler.schedulers.background import BackgroundScheduler

from config import CITIES
from weather import fetch_weather
from model import predict_city
from database import (
    cache_weather,
    get_cached_weather,
    cleanup_old_weather,
    get_session,
    PredictionCache,
)

logger = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))

# Global scheduler instance
_scheduler = None


def refresh_all_cities():
    """
    Fetch fresh weather and run predictions for all 6 cities.
    Called every hour by the scheduler, and once at startup.
    """
    logger.info("🔄 Starting scheduled refresh for all cities...")
    results = {}

    for city_id, city_info in CITIES.items():
        try:
            # 1. Fetch fresh weather
            weather_data = fetch_weather(city_info["lat"], city_info["lon"])
            if not weather_data or not weather_data.get("current"):
                logger.warning(f"  ⚠️ No weather data for {city_id}, skipping")
                continue

            current = weather_data["current"]

            # 2. Cache the current weather observation
            cache_weather(city_id, current)

            # 3. Get cached history for rolling features
            cached = get_cached_weather(city_id, hours=24)

            # 4. Run prediction
            prediction = predict_city(city_id, current, cached)

            # 5. Build forecast (run predictions on future hours)
            forecast_list = []
            future_hours = weather_data.get("hourly", [])[1:]  # Skip current hour
            for hour_data in future_hours[:48]:  # Up to 48 hours ahead
                hour_pred = predict_city(city_id, hour_data, cached)
                forecast_list.append({
                    "timestamp": hour_data.get("timestamp", ""),
                    "risk": hour_pred.get("adjusted_risk", 0),
                    "risk_level": hour_pred.get("risk_level", "LOW"),
                    "temperature": hour_data.get("temperature_2m", 0),
                    "precipitation": hour_data.get("precipitation", 0),
                })

            # 6. Save to prediction cache
            _save_prediction_cache(city_id, prediction, current, forecast_list)

            results[city_id] = prediction.get("adjusted_risk", 0)
            logger.info(
                f"  ✅ {city_info['name']}: {prediction.get('adjusted_risk', 0)}% "
                f"{prediction.get('risk_level', 'N/A')}"
            )

        except Exception as e:
            logger.error(f"  ❌ Error refreshing {city_id}: {e}")

    # 7. Clean up old weather cache entries
    cleanup_old_weather(hours=48)

    logger.info(f"✅ Refresh complete. {len(results)}/{len(CITIES)} cities updated.")
    return results


def _save_prediction_cache(city_id: str, prediction: dict, weather: dict, forecast: list):
    """Save the latest prediction to the database cache."""
    session = get_session()
    try:
        existing = session.query(PredictionCache).filter_by(city_id=city_id).first()

        weather_clean = {k: v for k, v in weather.items() if k != "timestamp"}
        now = datetime.now(IST)

        if existing:
            existing.raw_risk = prediction.get("raw_risk", 0)
            existing.adjusted_risk = prediction.get("adjusted_risk", 0)
            existing.risk_level = prediction.get("risk_level", "LOW")
            existing.rain_adjustment_applied = 1 if prediction.get("rain_adjustment_applied") else 0
            existing.weather_json = json.dumps(weather_clean)
            existing.forecast_json = json.dumps(forecast)
            existing.updated_at = now
        else:
            entry = PredictionCache(
                city_id=city_id,
                raw_risk=prediction.get("raw_risk", 0),
                adjusted_risk=prediction.get("adjusted_risk", 0),
                risk_level=prediction.get("risk_level", "LOW"),
                rain_adjustment_applied=1 if prediction.get("rain_adjustment_applied") else 0,
                weather_json=json.dumps(weather_clean),
                forecast_json=json.dumps(forecast),
                updated_at=now,
            )
            session.add(entry)

        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save prediction cache for {city_id}: {e}")
    finally:
        session.close()


def get_cached_prediction(city_id: str) -> dict:
    """Retrieve the latest cached prediction for a city."""
    session = get_session()
    try:
        cached = session.query(PredictionCache).filter_by(city_id=city_id).first()
        if not cached:
            return None

        return {
            "raw_risk": cached.raw_risk,
            "adjusted_risk": cached.adjusted_risk,
            "risk_level": cached.risk_level,
            "rain_adjustment_applied": bool(cached.rain_adjustment_applied),
            "weather": json.loads(cached.weather_json) if cached.weather_json else {},
            "forecast": json.loads(cached.forecast_json) if cached.forecast_json else [],
            "updated_at": cached.updated_at.isoformat() if cached.updated_at else None,
        }
    finally:
        session.close()


def start_scheduler():
    """Start the background scheduler that refreshes predictions every hour."""
    global _scheduler
    if _scheduler and _scheduler.running:
        logger.info("Scheduler already running")
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        refresh_all_cities,
        "interval",
        minutes=60,
        id="refresh_predictions",
        name="Refresh weather & predictions for all cities",
    )
    _scheduler.start()
    logger.info("⏰ Background scheduler started (refreshing every 60 minutes)")


def stop_scheduler():
    """Stop the background scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
