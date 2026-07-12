"""
config.py — Central configuration for the Beyond the Black Box backend.
All city data, feature definitions, and constants live here.
"""

# ── 6 Target Cities with coordinates, DISCOM, and fragility ──
CITIES = {
    "lucknow": {
        "name": "Lucknow",
        "lat": 26.85,
        "lon": 80.95,
        "discom": "MVVNL",
        "fragility": 1.13,
    },
    "noida": {
        "name": "Noida",
        "lat": 28.57,
        "lon": 77.32,
        "discom": "PVVNL",
        "fragility": 0.93,
    },
    "ghaziabad": {
        "name": "Ghaziabad",
        "lat": 28.67,
        "lon": 77.42,
        "discom": "PVVNL",
        "fragility": 1.00,
    },
    "agra": {
        "name": "Agra",
        "lat": 27.18,
        "lon": 78.02,
        "discom": "DVVNL",
        "fragility": 1.27,
    },
    "firozabad": {
        "name": "Firozabad",
        "lat": 27.15,
        "lon": 78.39,
        "discom": "DVVNL",
        "fragility": 1.40,
    },
    "meerut": {
        "name": "Meerut",
        "lat": 28.98,
        "lon": 77.71,
        "discom": "PVVNL",
        "fragility": 1.07,
    },
}

# ── 10 Weather variables fetched from Open-Meteo ──
WEATHER_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "wind_speed_10m",
    "cloud_cover",
    "surface_pressure",
    "wind_gusts_10m",
    "dewpoint_2m",
    "shortwave_radiation",
    "weather_code",
]

# ── 26 Features the XGBoost model expects (EXACT ORDER) ──
FEATURES_V2 = [
    "temperature_2m", "relative_humidity_2m", "precipitation",
    "wind_speed_10m", "cloud_cover", "surface_pressure",
    "wind_gusts_10m", "dewpoint_2m", "shortwave_radiation",
    "hour_of_day", "day_of_week", "month",
    "is_summer", "is_monsoon", "is_peak_hour", "is_thunderstorm",
    "heat_index", "gust_ratio", "dewpoint_depression",
    "temp_x_humidity", "rain_x_wind",
    "rolling_avg_temp_24h", "rolling_max_temp_24h",
    "temp_change_3h", "pressure_change_3h",
    "consecutive_hot_hours",
]

# ── Risk level thresholds ──
RISK_THRESHOLDS = {
    "CRITICAL": 70,  # >= 70%
    "HIGH": 50,      # 50-70%
    "MODERATE": 30,  # 30-50%
    "LOW": 0,        # < 30%
}

# ── Model configuration ──
MODEL_PATH = "../models/xgboost_model_v2.json"
MODEL_THRESHOLD = 0.55

# ── WMO weather codes that indicate thunderstorm/severe weather ──
STORM_CODES = [95, 96, 99, 65, 67, 75, 77, 85, 86]

# ── Indian season definitions ──
SUMMER_MONTHS = [4, 5, 6]    # April, May, June
MONSOON_MONTHS = [7, 8, 9]   # July, August, September
PEAK_HOURS = [6, 7, 8, 9, 10, 18, 19, 20, 21, 22]  # 6-10 AM, 6-10 PM

# ── Open-Meteo API ──
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# ── Scheduler ──
REFRESH_INTERVAL_MINUTES = 60  # Auto-refresh predictions every hour
