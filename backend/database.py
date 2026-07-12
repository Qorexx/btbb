"""
database.py — SQLite database layer for weather caching and citizen reports.
Uses SQLAlchemy ORM for clean, Pythonic database access.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

# Indian Standard Time
IST = timezone(timedelta(hours=5, minutes=30))

# Database file lives inside the backend directory
DB_PATH = os.path.join(os.path.dirname(__file__), "btbb.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


# ── Table: users ──
# Stores user accounts for authentication.
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    created_at = Column(DateTime, default=lambda: datetime.now(IST))


# ── Table: profiles ──
# Stores simple hackathon demo profiles (no auth required).
class Profile(Base):
    __tablename__ = "profiles"

    session_id = Column(String(100), primary_key=True)
    name = Column(String(100))
    city_id = Column(String(20))
    area = Column(String(100))
    updated_at = Column(DateTime, default=lambda: datetime.now(IST), onupdate=lambda: datetime.now(IST))


# ── Table: weather_cache ──
# Stores hourly weather readings per city so we can compute
# rolling features (rolling_avg_temp_24h, etc.) accurately.
class WeatherCache(Base):
    __tablename__ = "weather_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    city_id = Column(String(20), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    temperature_2m = Column(Float)
    relative_humidity_2m = Column(Float)
    precipitation = Column(Float)
    wind_speed_10m = Column(Float)
    cloud_cover = Column(Float)
    surface_pressure = Column(Float)
    wind_gusts_10m = Column(Float)
    dewpoint_2m = Column(Float)
    shortwave_radiation = Column(Float)
    weather_code = Column(Float)


# ── Table: citizen_reports ──
# Stores outage reports submitted by users from the Android app.
class CitizenReport(Base):
    __tablename__ = "citizen_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    city_id = Column(String(20), nullable=False, index=True)
    location = Column(String(200), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    issue_type = Column(String(50), nullable=False)
    duration = Column(String(100))
    details = Column(Text)
    reporter_name = Column(String(100))
    submitted_at = Column(DateTime, default=lambda: datetime.now(IST))


# ── Table: prediction_cache ──
# Stores the latest predictions per city so we can serve fast responses.
class PredictionCache(Base):
    __tablename__ = "prediction_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    city_id = Column(String(20), nullable=False, unique=True, index=True)
    raw_risk = Column(Float)
    adjusted_risk = Column(Float)
    risk_level = Column(String(20))
    rain_adjustment_applied = Column(Integer, default=0)  # 0=False, 1=True
    weather_json = Column(Text)  # JSON string of current weather
    forecast_json = Column(Text)  # JSON string of forecast data
    updated_at = Column(DateTime)


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(engine)
    logger.info(f"Database initialized at {DB_PATH}")


def get_session():
    """Get a new database session."""
    return SessionLocal()


def cache_weather(city_id: str, weather_row: dict):
    """Store a single hour of weather data in the cache."""
    session = get_session()
    try:
        entry = WeatherCache(
            city_id=city_id,
            timestamp=datetime.fromisoformat(weather_row.get("timestamp", "")),
            temperature_2m=weather_row.get("temperature_2m"),
            relative_humidity_2m=weather_row.get("relative_humidity_2m"),
            precipitation=weather_row.get("precipitation"),
            wind_speed_10m=weather_row.get("wind_speed_10m"),
            cloud_cover=weather_row.get("cloud_cover"),
            surface_pressure=weather_row.get("surface_pressure"),
            wind_gusts_10m=weather_row.get("wind_gusts_10m"),
            dewpoint_2m=weather_row.get("dewpoint_2m"),
            shortwave_radiation=weather_row.get("shortwave_radiation"),
            weather_code=weather_row.get("weather_code"),
        )
        session.add(entry)
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to cache weather for {city_id}: {e}")
    finally:
        session.close()


def get_cached_weather(city_id: str, hours: int = 24) -> list:
    """
    Get the last N hours of cached weather for a city.
    Returns list of dicts sorted by timestamp ascending.
    """
    session = get_session()
    try:
        cutoff = datetime.now(IST) - timedelta(hours=hours)
        rows = (
            session.query(WeatherCache)
            .filter(WeatherCache.city_id == city_id)
            .filter(WeatherCache.timestamp >= cutoff)
            .order_by(WeatherCache.timestamp.asc())
            .all()
        )
        return [
            {
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "temperature_2m": r.temperature_2m,
                "relative_humidity_2m": r.relative_humidity_2m,
                "precipitation": r.precipitation,
                "wind_speed_10m": r.wind_speed_10m,
                "cloud_cover": r.cloud_cover,
                "surface_pressure": r.surface_pressure,
                "wind_gusts_10m": r.wind_gusts_10m,
                "dewpoint_2m": r.dewpoint_2m,
                "shortwave_radiation": r.shortwave_radiation,
                "weather_code": r.weather_code,
            }
            for r in rows
        ]
    finally:
        session.close()


def cleanup_old_weather(hours: int = 48):
    """Delete weather cache entries older than N hours to keep DB small."""
    session = get_session()
    try:
        cutoff = datetime.now(IST) - timedelta(hours=hours)
        deleted = (
            session.query(WeatherCache)
            .filter(WeatherCache.timestamp < cutoff)
            .delete()
        )
        session.commit()
        if deleted > 0:
            logger.info(f"Cleaned up {deleted} old weather cache entries")
    except Exception as e:
        session.rollback()
        logger.error(f"Cleanup failed: {e}")
    finally:
        session.close()


def submit_report(city_id: str, location: str, issue_type: str,
                  duration: str = None, details: str = None,
                  reporter_name: str = None, latitude: float = None, longitude: float = None) -> dict:
    """Submit a new citizen outage report. Returns the created report."""
    session = get_session()
    try:
        report = CitizenReport(
            city_id=city_id,
            location=location,
            latitude=latitude,
            longitude=longitude,
            issue_type=issue_type,
            duration=duration,
            details=details,
            reporter_name=reporter_name,
            submitted_at=datetime.now(IST),
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        return {
            "id": report.id,
            "status": "submitted",
            "message": "Report submitted successfully.",
        }
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to submit report: {e}")
        return {"id": None, "status": "error", "message": str(e)}
    finally:
        session.close()


def get_reports(city_id: str) -> list:
    """Get all citizen reports for a city, newest first."""
    session = get_session()
    try:
        rows = (
            session.query(CitizenReport)
            .filter(CitizenReport.city_id == city_id)
            .order_by(CitizenReport.submitted_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "location": r.location,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "issue_type": r.issue_type,
                "duration": r.duration,
                "details": r.details,
                "reporter_name": r.reporter_name,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            }
            for r in rows
        ]
    finally:
        session.close()


# ── User Authentication Helpers ──

def get_user_by_email(email: str):
    """Fetch a user by their email address."""
    session = get_session()
    try:
        return session.query(User).filter(User.email == email).first()
    finally:
        session.close()


def create_user(email: str, hashed_password: str, full_name: str = None):
    """Create a new user account."""
    session = get_session()
    try:
        user = User(
            email=email,
            hashed_password=hashed_password,
            full_name=full_name
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create user: {e}")
        return None
    finally:
        session.close()


# ── Profile Helpers ──

def get_profile(session_id: str):
    """Fetch a demo profile by session_id."""
    session = get_session()
    try:
        return session.query(Profile).filter(Profile.session_id == session_id).first()
    finally:
        session.close()


def create_or_update_profile(session_id: str, name: str, city_id: str, area: str):
    """Create or update a hackathon demo profile."""
    session = get_session()
    try:
        profile = session.query(Profile).filter(Profile.session_id == session_id).first()
        if profile:
            profile.name = name
            profile.city_id = city_id
            profile.area = area
        else:
            profile = Profile(
                session_id=session_id,
                name=name,
                city_id=city_id,
                area=area
            )
            session.add(profile)
        session.commit()
        session.refresh(profile)
        return profile
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save profile: {e}")
        return None
    finally:
        session.close()
