"""
⚡ BTBB Live Dashboard — Real XGBoost Predictions with Live Weather
===================================================================
This script does what the Backend API will do, but as a standalone tool:

1. Fetches LIVE weather from Open-Meteo for all 6 cities
2. Engineers all 26 features (exactly like inference_v2.py)
3. Loads the real XGBoost v2 model
4. Runs predictions, applies rain + fragility adjustments
5. Prints a beautiful live dashboard

This serves as:
- A validation tool (proof the ML pipeline works end-to-end)
- A backup demo tool (if the app/backend has issues during the hackathon)
- A reference for Member 1 (Backend) to replicate the pipeline
"""

import pandas as pd
import numpy as np
import xgboost as xgb
import requests
import json
import os
from datetime import datetime

# ── Path setup ──
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
# If this script is in src/, go up one level
if os.path.basename(PROJECT_ROOT) == "src":
    PROJECT_ROOT = os.path.dirname(PROJECT_ROOT)

MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "xgboost_model_v2.json")
FRAGILITY_PATH = os.path.join(PROJECT_ROOT, "models", "fragility_scores.json")

# ── Our 6 target cities ──
CITIES = {
    "Lucknow":   {"lat": 26.85, "lon": 80.95, "discom": "MVVNL"},
    "Noida":     {"lat": 28.57, "lon": 77.32, "discom": "PVVNL"},
    "Ghaziabad": {"lat": 28.67, "lon": 77.42, "discom": "PVVNL"},
    "Agra":      {"lat": 27.18, "lon": 78.02, "discom": "DVVNL"},
    "Firozabad": {"lat": 27.15, "lon": 78.39, "discom": "DVVNL"},
    "Meerut":    {"lat": 28.98, "lon": 77.71, "discom": "PVVNL"},
}

# The 10 raw weather variables we fetch from Open-Meteo
WEATHER_VARS = [
    "temperature_2m", "relative_humidity_2m", "precipitation",
    "wind_speed_10m", "cloud_cover", "surface_pressure",
    "wind_gusts_10m", "dewpoint_2m", "shortwave_radiation", "weather_code",
]

# The 26 features our model expects, in exact order
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

# WMO weather codes that indicate thunderstorms
STORM_CODES = [95, 96, 99, 65, 67, 75, 77, 85, 86]


# ─────────────────────────────────────────────
# HEAT INDEX (Steadman's formula — same as inference_v2.py)
# ─────────────────────────────────────────────
def calculate_heat_index(T_celsius, RH):
    """
    Converts temperature + humidity into 'feels like' temperature.
    This matters because transformers care about EFFECTIVE heat,
    not just air temperature. High humidity traps heat.
    """
    T = (T_celsius * 9 / 5) + 32  # Convert to Fahrenheit
    HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094))
    full_hi = (
        -42.379 + 2.04901523 * T + 10.14333127 * RH
        - 0.22475541 * T * RH - 0.00683783 * T * T
        - 0.05481717 * RH * RH + 0.00122874 * T * T * RH
        + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH
    )
    HI_final_F = np.where(HI >= 80, full_hi, HI)
    HI_final_F = np.where(T < 40, T, HI_final_F)
    return (HI_final_F - 32) * 5 / 9  # Back to Celsius


# ─────────────────────────────────────────────
# RAIN HAZARD ADJUSTMENT (from our calibration in Task 1)
# ─────────────────────────────────────────────
def apply_rain_adjustment(raw_risk, precipitation, wind_speed):
    """
    Boosts the risk score during rainy conditions because our
    US-trained model doesn't account for India's poor weatherproofing.
    Returns (adjusted_risk, was_adjusted).
    """
    if precipitation > 2 and wind_speed > 15:
        return raw_risk * 1.40, True
    elif precipitation > 5:
        return raw_risk * 1.30, True
    elif precipitation > 2:
        return raw_risk * 1.20, True
    elif precipitation > 0:
        return raw_risk * 1.10, True
    return raw_risk, False


# ─────────────────────────────────────────────
# PERCEPTUAL CALIBRATION (UX Fix)
# ─────────────────────────────────────────────
def apply_perceptual_calibration(risk):
    """
    Squashes low probabilities to match human intuition.
    In statistics, 35% base risk is normal. To a human, 35% sounds dangerous.
    This scales <40% risk down to <10% for the UI.
    """
    if risk < 40:
        return risk * 0.25  # 40% becomes 10%
    elif risk < 60:
        return 10 + ((risk - 40) * 1.5)  # 60% becomes 40%
    else:
        return risk  # Leave high risk alone


# ─────────────────────────────────────────────
# RISK LEVEL CLASSIFICATION
# ─────────────────────────────────────────────
def classify_risk(risk_pct):
    if risk_pct >= 70:
        return "CRITICAL"
    elif risk_pct >= 50:
        return "HIGH"
    elif risk_pct >= 30:
        return "MODERATE"
    else:
        return "LOW"


# ─────────────────────────────────────────────
# FETCH LIVE WEATHER
# ─────────────────────────────────────────────
def fetch_weather(lat, lon):
    """
    Fetches the last 24 hours + next 48 hours of weather from Open-Meteo.
    We need past hours to calculate rolling features (rolling_avg_temp_24h etc).
    
    IMPORTANT: We use the FORECAST API (not Archive API).
    past_hours=24 gives us the last 24 hours for rolling calculations.
    forecast_days=2 gives us the next 48 hours for the forecast chart.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(WEATHER_VARS),
        "timezone": "Asia/Kolkata",
        "past_hours": 24,       # Last 24 hours (for rolling features)
        "forecast_days": 2,     # Next 48 hours
    }
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


# ─────────────────────────────────────────────
# ENGINEER ALL 26 FEATURES
# ─────────────────────────────────────────────
def engineer_features(weather_json):
    """
    Takes raw Open-Meteo JSON and produces a DataFrame with all 26 features.
    This is the exact same logic as inference_v2.py, adapted for live data.
    """
    hourly = weather_json["hourly"]

    # Build base DataFrame from raw weather
    df = pd.DataFrame({"hour_timestamp": pd.to_datetime(hourly["time"])})
    for var in WEATHER_VARS:
        df[var] = hourly.get(var)

    # Fill any missing values with 0
    df = df.fillna(0)

    # ── Time-based features ──
    df["hour_of_day"] = df["hour_timestamp"].dt.hour
    df["day_of_week"] = df["hour_timestamp"].dt.dayofweek
    df["month"] = df["hour_timestamp"].dt.month

    # ── Season & peak flags (Indian definitions) ──
    df["is_summer"] = df["month"].isin([4, 5, 6]).astype(int)
    df["is_monsoon"] = df["month"].isin([7, 8, 9]).astype(int)
    df["is_peak_hour"] = df["hour_of_day"].isin(
        [6, 7, 8, 9, 10, 18, 19, 20, 21, 22]
    ).astype(int)

    # ── Thunderstorm flag ──
    df["is_thunderstorm"] = df["weather_code"].isin(STORM_CODES).astype(int)

    # ── Derived weather features ──
    df["heat_index"] = calculate_heat_index(
        df["temperature_2m"].values, df["relative_humidity_2m"].values
    )
    df["gust_ratio"] = np.where(
        df["wind_speed_10m"] > 0,
        df["wind_gusts_10m"] / df["wind_speed_10m"],
        0,
    )
    df["dewpoint_depression"] = df["temperature_2m"] - df["dewpoint_2m"]
    df["temp_x_humidity"] = df["temperature_2m"] * df["relative_humidity_2m"] / 100
    df["rain_x_wind"] = df["precipitation"] * df["wind_speed_10m"]

    # ── Rolling features (this is why we fetched past_hours=24) ──
    df["rolling_avg_temp_24h"] = df["temperature_2m"].rolling(24, min_periods=1).mean()
    df["rolling_max_temp_24h"] = df["temperature_2m"].rolling(24, min_periods=1).max()
    df["temp_change_3h"] = df["temperature_2m"].diff(3)
    df["pressure_change_3h"] = df["surface_pressure"].diff(3)

    # ── Consecutive hot hours ──
    hot = (df["temperature_2m"] > 35).astype(int)
    streaks = hot.groupby((hot != hot.shift()).cumsum()).cumsum()
    df["consecutive_hot_hours"] = streaks * hot

    # Fill any NaNs from diff/rolling with 0
    df = df.fillna(0)

    return df


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    now = datetime.now()

    print()
    print("⚡ BTBB LIVE RISK DASHBOARD")
    print(f"   {now.strftime('%Y-%m-%d %I:%M %p IST')}")
    print("═" * 70)

    # ── Step 1: Load the real XGBoost model ──
    print("\n📦 Loading XGBoost v2 model...", end=" ", flush=True)
    model = xgb.XGBClassifier()
    model.load_model(MODEL_PATH)
    print("✅")

    # ── Step 2: Load fragility scores ──
    print("📦 Loading fragility scores...", end=" ", flush=True)
    with open(FRAGILITY_PATH) as f:
        fragility_data = json.load(f)
    print("✅")

    # ── Step 3: For each city, fetch weather → engineer → predict ──
    results = []

    for city_name, info in CITIES.items():
        print(f"\n🌐 Fetching weather for {city_name}...", end=" ", flush=True)

        try:
            # Fetch live weather (past 24h + next 48h)
            weather_json = fetch_weather(info["lat"], info["lon"])
            print("✅")

            # Engineer all 26 features
            df = engineer_features(weather_json)

            # Find the row closest to the current hour
            current_hour = now.strftime("%Y-%m-%dT%H:00")
            current_idx = df[df["hour_timestamp"].dt.strftime("%Y-%m-%dT%H:00") == current_hour].index
            if len(current_idx) == 0:
                # Fallback: use the latest available hour
                current_idx = [df.index[-1]]
            idx = current_idx[0]

            # Get the feature vector for the current hour
            X = df.loc[[idx], FEATURES_V2]

            # Run the real model
            prob = model.predict_proba(X)[:, 1][0]
            raw_risk = round(prob * 100, 1)

            # Get current weather values for display
            row = df.loc[idx]
            temp = row["temperature_2m"]
            humidity = row["relative_humidity_2m"]
            rain = row["precipitation"]
            wind = row["wind_speed_10m"]
            gusts = row["wind_gusts_10m"]
            pressure = row["surface_pressure"]
            cons_hot = row["consecutive_hot_hours"]

            # Apply rain adjustment
            rain_adjusted_risk, rain_applied = apply_rain_adjustment(raw_risk, rain, wind)

            # Apply fragility
            fragility = fragility_data.get("fragility_scores", {}).get(city_name, 1.0)
            fragility_adjusted = min(rain_adjusted_risk * fragility, 99.9)

            # Apply perceptual calibration (UX fix)
            final_risk = apply_perceptual_calibration(fragility_adjusted)
            risk_level = classify_risk(final_risk)

            results.append({
                "city": city_name,
                "discom": info["discom"],
                "fragility": fragility,
                "temp": temp,
                "humidity": humidity,
                "rain": rain,
                "wind": wind,
                "gusts": gusts,
                "pressure": pressure,
                "cons_hot": cons_hot,
                "raw_risk": raw_risk,
                "final_risk": round(final_risk, 1),
                "risk_level": risk_level,
                "rain_applied": rain_applied,
            })

        except Exception as e:
            print(f"❌ Error: {e}")
            results.append({
                "city": city_name,
                "discom": info["discom"],
                "error": str(e),
            })

    # ── Step 4: Print the dashboard ──
    print("\n")
    print("═" * 70)
    print(f"  {'City':<12} {'Temp':>6} {'Hum':>5} {'Rain':>6} {'Gusts':>7} {'HotHrs':>7} {'Raw':>6} {'Final':>7} {'Level':<10}")
    print("─" * 70)

    for r in sorted(results, key=lambda x: x.get("final_risk", 0), reverse=True):
        if "error" in r:
            print(f"  {r['city']:<12} {'ERROR':>50} {r['error']}")
            continue

        # Color indicators for the terminal
        level = r["risk_level"]
        indicator = "🔴" if level == "CRITICAL" else "🟠" if level == "HIGH" else "🟡" if level == "MODERATE" else "🟢"
        rain_flag = " 🌧️" if r["rain_applied"] else ""

        print(
            f"  {r['city']:<12} "
            f"{r['temp']:>5.1f}° "
            f"{r['humidity']:>4.0f}% "
            f"{r['rain']:>5.1f}mm "
            f"{r['gusts']:>5.1f}kph "
            f"{r['cons_hot']:>5.0f}h  "
            f"{r['raw_risk']:>5.1f}% "
            f"{r['final_risk']:>6.1f}% "
            f"{indicator} {level}{rain_flag}"
        )

    print("─" * 70)

    # Print fragility impact comparison
    print("\n📊 Fragility Impact (same weather, different risk):")
    for r in sorted(results, key=lambda x: x.get("fragility", 0), reverse=True):
        if "error" in r:
            continue
        bar_len = int(r["fragility"] * 20)
        bar = "█" * bar_len
        diff = ((r["fragility"] - 1) * 100)
        sign = "+" if diff >= 0 else ""
        print(f"   {r['city']:<12} {r['discom']:<6} {r['fragility']:.2f} {bar} ({sign}{diff:.0f}%)")

    print("\n" + "═" * 70)
    print("✅ Live dashboard complete!")
    print("═" * 70)


if __name__ == "__main__":
    main()
