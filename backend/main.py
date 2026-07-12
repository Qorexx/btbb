"""
main.py — FastAPI application for Beyond the Black Box.
The "front door" of the backend. Defines all 6 API endpoints
that the Android app calls to get predictions, forecasts,
explanations, and submit reports.

Run with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr

from config import CITIES
from model import load_model, predict_city, explain_prediction
from weather import fetch_weather, fetch_historical_weather
from database import (
    init_db,
    cache_weather,
    get_cached_weather,
    submit_report,
    get_reports,
    create_user,
    get_user_by_email,
    SessionLocal,
    Profile,
    CitizenReport
)
from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
)
from scheduler import (
    start_scheduler,
    stop_scheduler,
    refresh_all_cities,
    get_cached_prediction,
)

# ── Logging setup ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-12s | %(levelname)-5s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("btbb")

# Indian Standard Time
IST = timezone(timedelta(hours=5, minutes=30))


# ── Startup & Shutdown ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs on server start and stop."""
    # STARTUP
    logger.info("=" * 60)
    logger.info("🚀 Beyond the Black Box — Backend Starting")
    logger.info("=" * 60)

    # 1. Initialize database tables
    init_db()
    logger.info("✅ Database initialized")

    # 2. Load ML model into memory
    load_model()
    logger.info("✅ XGBoost model loaded")

    # 3. Run initial prediction refresh for all cities
    logger.info("🔄 Running initial prediction refresh...")
    refresh_all_cities()
    logger.info("✅ Initial predictions ready")

    # 4. Start background scheduler (hourly refresh)
    start_scheduler()
    logger.info("✅ Background scheduler started")

    logger.info("=" * 60)
    logger.info("🟢 Server is READY — all systems operational")
    logger.info("=" * 60)

    yield  # Server runs here

    # SHUTDOWN
    stop_scheduler()
    logger.info("Server shut down cleanly.")


# ── FastAPI App ──
app = FastAPI(
    title="Beyond the Black Box — API",
    description="AI-powered weather-induced power outage prediction for UP/NCR India",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow all origins for hackathon (Android app needs this)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response Models ──
class ReportRequest(BaseModel):
    city_id: str
    location: str
    issue_type: str
    duration: str = None
    details: str = None
    reporter_name: str = None

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str = None

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    email: str
    full_name: str = None


# ═════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═════════════════════════════════════════════════════════════

# ── 0. AUTHENTICATION ──

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate):
    db_user = get_user_by_email(email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_pwd = get_password_hash(user.password)
    new_user = create_user(email=user.email, hashed_password=hashed_pwd, full_name=user.full_name)
    if not new_user:
        raise HTTPException(status_code=500, detail="Failed to create user")
        
    return UserResponse(email=new_user.email, full_name=new_user.full_name)


@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_email(email=form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


# ── 1. GET /api/cities ──
# Returns all 6 cities with current risk levels (for the app home screen)
@app.get("/api/cities")
def get_cities(heatwave: bool = False, target_time: str = None):
    """Get summarized power outage risk for all tracked cities."""
    # Override with global state if active
    global GLOBAL_HEATWAVE, GLOBAL_TARGET_TIME
    if GLOBAL_HEATWAVE:
        heatwave = True
    if GLOBAL_TARGET_TIME:
        target_time = GLOBAL_TARGET_TIME

    cities_list = []
    for city_id, city_info in CITIES.items():
        cached = get_cached_prediction(city_id)
        if heatwave and cached:
            weather_data = get_cached_weather(city_id, hours=1)
            temp = 45.0
            base_risk = 60 + (temp - 40) * 5
            adj = min(99.0, round(base_risk * city_info["fragility"], 1))
            cities_list.append({
                "id": city_id,
                "name": city_info["name"],
                "discom": city_info["discom"],
                "fragility": city_info["fragility"],
                "lat": city_info["lat"],
                "lng": city_info["lon"],
                "current_risk": adj,
                "risk_level": "CRITICAL" if adj >= 70 else ("HIGH" if adj >= 50 else "MODERATE"),
                "last_updated": cached.get("updated_at"),
            })
        elif cached:
            cities_list.append({
                "id": city_id,
                "name": city_info["name"],
                "discom": city_info["discom"],
                "fragility": city_info["fragility"],
                "lat": city_info["lat"],
                "lng": city_info["lon"],
                "current_risk": cached["adjusted_risk"],
                "risk_level": cached["risk_level"],
                "last_updated": cached.get("updated_at"),
            })
        else:
            # No cache
            cities_list.append({
                "id": city_id,
                "name": city_info["name"],
                "discom": city_info["discom"],
                "fragility": city_info["fragility"],
                "lat": city_info["lat"],
                "lng": city_info["lon"],
                "current_risk": 0,
                "risk_level": "UNKNOWN",
                "last_updated": None,
            })
    return {"cities": cities_list}


# ── 2. GET /api/predict/{city_id} ──
# Detailed prediction for a single city
GLOBAL_HEATWAVE = False
GLOBAL_TARGET_TIME = None

@app.get("/api/trigger-heatwave")
def trigger_global_heatwave(active: bool = True):
    global GLOBAL_HEATWAVE
    GLOBAL_HEATWAVE = active
    return {"status": "success", "heatwave": active, "message": "Global heatwave toggled for mobile app!"}

@app.get("/api/trigger-historical")
def trigger_global_historical(date: str = None):
    global GLOBAL_TARGET_TIME
    GLOBAL_TARGET_TIME = date
    return {"status": "success", "target_time": date, "message": "Global historical mode toggled for mobile app!"}

@app.get("/api/predict/{city_id}")
def predict(city_id: str, heatwave: bool = False, target_time: str = None):
    """Predict power outage risk for a city."""
    # Override with global state if active
    global GLOBAL_HEATWAVE, GLOBAL_TARGET_TIME
    if GLOBAL_HEATWAVE:
        heatwave = True
    if GLOBAL_TARGET_TIME:
        target_time = GLOBAL_TARGET_TIME

    if city_id not in CITIES:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")

    city = CITIES[city_id]

    if not heatwave and not target_time:
        cached = get_cached_prediction(city_id)
        if cached:
            now_str = cached.get("updated_at", datetime.now(IST).isoformat())
            return {
                "city_id": city_id,
                "city_name": city["name"],
                "discom": city["discom"],
                "fragility": city["fragility"],
                "raw_risk": cached["raw_risk"],
                "adjusted_risk": cached["adjusted_risk"],
                "risk_level": cached["risk_level"],
                "rain_adjustment_applied": cached["rain_adjustment_applied"],
                "weather": cached["weather"],
                "timestamp": now_str,
            }

    if target_time:
        weather_data = fetch_historical_weather(city["lat"], city["lon"], target_time)
        if not weather_data or not weather_data.get("current"):
            raise HTTPException(status_code=503, detail="Historical weather data unavailable")
            
        current = weather_data["current"]
        history = weather_data.get("history", [])
        result = predict_city(city_id, current, history)
        
        weather_clean = {k: v for k, v in current.items() if k != "timestamp"}
        return {
            "city_id": city_id,
            "city_name": city["name"],
            "discom": city["discom"],
            "fragility": city["fragility"],
            "raw_risk": result["raw_risk"],
            "adjusted_risk": result["adjusted_risk"],
            "risk_level": result["risk_level"],
            "rain_adjustment_applied": result.get("rain_adjustment_applied", False),
            "weather": weather_clean,
            "timestamp": target_time,
        }

    # No cache — run live prediction
    weather_data = fetch_weather(city["lat"], city["lon"])
    if not weather_data or not weather_data.get("current"):
        raise HTTPException(status_code=503, detail="Weather data unavailable")

    current = weather_data["current"]
    if heatwave:
        current["temperature_2m"] = 45.5
        current["relative_humidity_2m"] = 65.0
        
    cache_weather(city_id, current)
    cached_history = get_cached_weather(city_id, hours=24)
    if heatwave:
        cached_history = [{"temperature_2m": 45.0} for _ in range(24)]
        
    result = predict_city(city_id, current, cached_history)

    if heatwave:
        base_risk = 60 + (current["temperature_2m"] - 40) * 5
        adj = min(99.0, round(base_risk * city["fragility"], 1))
        result["adjusted_risk"] = adj
        result["risk_level"] = "CRITICAL" if adj >= 70 else ("HIGH" if adj >= 50 else "MODERATE")

    weather_clean = {k: v for k, v in current.items() if k != "timestamp"}

    return {
        "city_id": city_id,
        "city_name": city["name"],
        "discom": city["discom"],
        "fragility": city["fragility"],
        "raw_risk": result.get("raw_risk", 0.0),
        "adjusted_risk": result["adjusted_risk"],
        "risk_level": result["risk_level"],
        "rain_adjustment_applied": result.get("rain_adjustment_applied", False),
        "weather": weather_clean,
        "timestamp": datetime.now(IST).isoformat(),
    }


# ── 3. GET /api/forecast/{city_id} ──
# 48-hour risk forecast for a city
@app.get("/api/forecast/{city_id}")
def forecast(city_id: str, heatwave: bool = False, target_time: str = None):
    """Get 48-hour risk forecast for a city."""
    if city_id not in CITIES:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")

    city = CITIES[city_id]

    if not heatwave and not target_time:
        cached = get_cached_prediction(city_id)
        if cached and cached.get("forecast"):
            return {
                "city_id": city_id,
                "city_name": city["name"],
                "forecast": cached["forecast"],
            }

    if target_time:
        weather_data = fetch_historical_weather(city["lat"], city["lon"], target_time)
        cached_history = weather_data.get("history", []) if weather_data else []
        forecast_hourly = weather_data.get("forecast", []) if weather_data else []
    else:
        weather_data = fetch_weather(city["lat"], city["lon"])
        cached_history = get_cached_weather(city_id, hours=24)
        forecast_hourly = weather_data.get("hourly", [])[1:49] if weather_data else []

    if not weather_data:
        raise HTTPException(status_code=503, detail="Weather data unavailable")

    forecast_list = []

    for hour_data in forecast_hourly:
        if heatwave:
            hour_data["temperature_2m"] = 45.0 + (hour_data.get("temperature_2m", 30) % 3)
            cached_history = [{"temperature_2m": 45.0} for _ in range(24)]
            
        pred = predict_city(city_id, hour_data, cached_history)
        
        if heatwave:
            base_risk = 60 + (hour_data.get("temperature_2m", 45) - 40) * 5
            adj = min(99.0, round(base_risk * city["fragility"], 1))
            pred["adjusted_risk"] = adj
            pred["risk_level"] = "CRITICAL" if adj >= 70 else ("HIGH" if adj >= 50 else "MODERATE")

        forecast_list.append({
            "timestamp": hour_data["timestamp"],
            "risk_level": pred["risk_level"],
            "risk": pred["adjusted_risk"],
            "temperature": hour_data.get("temperature_2m", 0),
            "precipitation": hour_data.get("precipitation", 0)
        })

    return {
        "city_id": city_id,
        "city_name": city["name"],
        "forecast": forecast_list,
    }


# ── 4. GET /api/explain/{city_id} ──
# Human-readable explanation of why risk is at current level
@app.get("/api/explain/{city_id}")
def explain(city_id: str, heatwave: bool = False, target_time: str = None):
    """Get explanation of the current risk prediction for a city."""
    global GLOBAL_HEATWAVE, GLOBAL_TARGET_TIME
    if GLOBAL_HEATWAVE:
        heatwave = True
    if GLOBAL_TARGET_TIME:
        target_time = GLOBAL_TARGET_TIME

    if city_id not in CITIES:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")

    city = CITIES[city_id]

    if not heatwave and not target_time:
        cached = get_cached_prediction(city_id)
        if cached:
            weather = cached["weather"]
            weather["timestamp"] = cached.get("updated_at", datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat())
            cached_history = get_cached_weather(city_id, hours=24)
            from model import engineer_features_single
            features = engineer_features_single(weather, cached_history)
            explanation = explain_prediction(features, cached["risk_level"], cached["adjusted_risk"], city_id, cached.get("rain_adjustment_applied", False))
            return {
                "city_id": city_id,
                "risk_level": cached["risk_level"],
                "adjusted_risk": cached["adjusted_risk"],
                "factors": explanation["factors"],
                "summary": explanation["summary"],
            }

    if target_time:
        weather_data = fetch_historical_weather(city["lat"], city["lon"], target_time)
        cached_history = weather_data.get("history", []) if weather_data else []
        current = weather_data.get("current", {}) if weather_data else {}
    else:
        weather_data = fetch_weather(city["lat"], city["lon"])
        cached_history = get_cached_weather(city_id, hours=24)
        current = weather_data.get("current", {}) if weather_data else {}

    if not current:
        raise HTTPException(status_code=503, detail="Weather data unavailable")

    if heatwave:
        current["temperature_2m"] = 45.0
        cached_history = [{"temperature_2m": 45.0} for _ in range(24)]

    from model import engineer_features_single
    features = engineer_features_single(current, cached_history)
    result = predict_city(city_id, current, cached_history)
    
    adj = result["adjusted_risk"]
    r_lvl = result["risk_level"]
    
    if heatwave:
        base_risk = 60 + (current.get("temperature_2m", 45) - 40) * 5
        adj = min(99.0, round(base_risk * city["fragility"], 1))
        r_lvl = "CRITICAL" if adj >= 70 else ("HIGH" if adj >= 50 else "MODERATE")

    explanation = explain_prediction(features, r_lvl, adj, city_id, result.get("rain_adjustment_applied", False))

    return {
        "city_id": city_id,
        "risk_level": r_lvl,
        "adjusted_risk": adj,
        "factors": explanation["factors"],
        "summary": explanation["summary"],
    }


# ── 5. POST /api/reports ──
# Submit a citizen outage report
@app.post("/api/reports")
def create_report(report: ReportRequest):
    """Submit a citizen outage report."""
    if report.city_id not in CITIES:
        raise HTTPException(status_code=404, detail=f"City '{report.city_id}' not found")

    result = submit_report(
        city_id=report.city_id,
        location=report.location,
        issue_type=report.issue_type,
        duration=report.duration,
        details=report.details,
        reporter_name=report.reporter_name,
    )

    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result


# ── 6. GET /api/reports/{city_id} ──
# Get all citizen reports for a city
@app.get("/api/reports/{city_id}")
def get_city_reports(city_id: str):
    """Get all citizen outage reports for a city."""
    if city_id not in CITIES:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")

    reports = get_reports(city_id)

    return {
        "city_id": city_id,
        "reports": reports,
    }


# ── Health check ──
@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(IST).isoformat(),
        "cities_count": len(CITIES),
    }

class ProfileRequest(BaseModel):
    session_id: str
    name: str
    city_id: str
    area: str

@app.post("/api/profile")
def save_profile(request: ProfileRequest):
    """Save hackathon demo profile."""
    from database import create_or_update_profile
    profile = create_or_update_profile(request.session_id, request.name, request.city_id, request.area)
    if profile:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to save profile")

# ── HACKATHON PUSH NOTIFICATION SIMULATION ──
PENDING_ALERTS = []

@app.get("/api/check-alerts")
def check_alerts():
    """App polls this endpoint to check for pending alerts."""
    global PENDING_ALERTS
    if PENDING_ALERTS:
        alert = PENDING_ALERTS.pop(0)
        return {"has_alert": True, "alert": alert}
    return {"has_alert": False}

@app.get("/api/trigger-alert")
def trigger_alert(title: str = "CRITICAL: Imminent Power Outage", body: str = "AI model detects 85% risk of transformer failure in your grid sector in the next 30 minutes. Please save your work."):
    """You hit this from your laptop to queue an alert for the phone."""
    global PENDING_ALERTS
    PENDING_ALERTS.append({"title": title, "body": body})
    return {"status": "success", "message": "Alert queued! The app will pick it up on the next poll."}

# ── 8. GET /admin ──
# Beautiful Web Interface to view the backend data
@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard():
    """Admin Dashboard for Hackathon Judges to see stored data."""
    db = SessionLocal()
    try:
        profiles = db.query(Profile).order_by(Profile.updated_at.desc()).all()
        reports = db.query(CitizenReport).order_by(CitizenReport.submitted_at.desc()).all()
        
        profiles_rows = "".join(f"""
            <tr class="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                <td class="p-3 text-white">{p.name}</td>
                <td class="p-3 text-gray-400">{p.city_id}</td>
                <td class="p-3 text-gray-400">{p.area}</td>
                <td class="p-3 text-green-400">{p.updated_at.strftime('%Y-%m-%d %H:%M:%S')}</td>
            </tr>
        """ for p in profiles)
        
        reports_rows = "".join(f"""
            <tr class="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                <td class="p-3 text-white">{r.reporter_name or 'Anonymous'}</td>
                <td class="p-3 text-gray-400">{r.city_id} - {r.location}</td>
                <td class="p-3 text-blue-400 text-xs font-mono">{f"{r.latitude:.5f}, {r.longitude:.5f}" if r.latitude and r.longitude else "N/A"}</td>
                <td class="p-3 text-orange-400 font-medium">{r.issue_type}</td>
                <td class="p-3 text-gray-300">{r.details or '-'}</td>
                <td class="p-3 text-gray-500">{r.submitted_at.strftime('%Y-%m-%d %H:%M:%S')}</td>
            </tr>
        """ for r in reports)
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BTBB Admin Command Center</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                body {{
                    font-family: 'Inter', sans-serif;
                    background-color: #030712; /* Very dark slate */
                    color: #f3f4f6;
                }}
            </style>
        </head>
        <body class="min-h-screen p-8">
            <div class="max-w-6xl mx-auto">
                <header class="mb-10 text-center flex flex-col items-center">
                    <div class="w-16 h-16 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <h1 class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                        Beyond the Black Box
                    </h1>
                    <p class="text-gray-400 mt-2 tracking-widest text-sm uppercase">Admin Command Center</p>
                </header>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Profiles -->
                    <div class="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
                        <div class="p-5 border-b border-gray-800 bg-gray-900/50">
                            <h2 class="text-xl font-semibold text-white">Registered Citizen Profiles ({len(profiles)})</h2>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-gray-950 text-gray-400">
                                    <tr>
                                        <th class="p-3 font-medium">Name</th>
                                        <th class="p-3 font-medium">City ID</th>
                                        <th class="p-3 font-medium">Area</th>
                                        <th class="p-3 font-medium">Last Active</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {profiles_rows if profiles else '<tr><td colspan="4" class="p-4 text-center text-gray-500">No profiles found</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Outage Reports -->
                    <div class="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl overflow-hidden lg:col-span-2">
                        <div class="p-5 border-b border-gray-800 bg-gray-900/50">
                            <h2 class="text-xl font-semibold text-white">Live Outage Reports ({len(reports)})</h2>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-gray-950 text-gray-400">
                                    <tr>
                                        <th class="p-3 font-medium">Reporter</th>
                                        <th class="p-3 font-medium">Location</th>
                                        <th class="p-3 font-medium">Coordinates</th>
                                        <th class="p-3 font-medium">Issue</th>
                                        <th class="p-3 font-medium">Details</th>
                                        <th class="p-3 font-medium">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reports_rows if reports else '<tr><td colspan="6" class="p-4 text-center text-gray-500">No reports found</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        return html_content
    finally:
        db.close()
