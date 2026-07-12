"""
Explainability Module for Beyond the Black Box
================================================
This file turns the AI's raw prediction into plain-English explanations.

HOW IT WORKS (for beginners):
-----------------------------
1. Our XGBoost model outputs a single number: e.g., "65% risk".
2. But users want to know WHY. This module looks at the current weather
   values and checks which ones are in a "dangerous" range.
3. For each dangerous condition it finds, it writes a human-readable
   sentence explaining the threat to the power grid.
4. It picks the top 3-5 most important factors and returns them
   along with a 1-2 sentence summary.

Member 1 (Backend): Import this file and call generate_explanation()
from your /api/explain/{city_id} endpoint.
"""


# ─────────────────────────────────────────────
# FEATURE DEFINITIONS
# ─────────────────────────────────────────────
# Each entry maps a weather feature to:
#   - label: What we show the user (plain English name)
#   - importance_rank: How much the AI cares about this feature (1 = most important)
#   - thresholds: Rules for when to flag it as "dangerous"
#   - explanations: What to tell the user at each danger level

FEATURE_RULES = {
    "temp_x_humidity": {
        "label": "Thermal-Moisture Stress",
        "importance_rank": 1,
        "check": lambda w: w.get("temperature_2m", 0) * w.get("relative_humidity_2m", 0) / 100,
        "thresholds": [
            {
                "min": 20,
                "impact": "high",
                "explanation": "Combined temperature × humidity stress is extremely elevated at {value:.1f}, causing severe thermal overload on distribution transformers."
            },
            {
                "min": 15,
                "impact": "high",
                "explanation": "Combined temperature × humidity stress is elevated at {value:.1f}, indicating significant thermal load on transformers."
            },
            {
                "min": 10,
                "impact": "medium",
                "explanation": "Moderate thermal-moisture stress at {value:.1f}. Transformers are under noticeable but manageable load."
            },
        ]
    },

    "is_summer": {
        "label": "Summer Season",
        "importance_rank": 2,
        "check": lambda w: 1 if w.get("month", 1) in [4, 5, 6] else 0,
        "thresholds": [
            {
                "min": 1,
                "impact": "high",
                "explanation": "We are in the Summer peak season (Apr–Jun), which historically accounts for 95% of all CRITICAL outage hours across UP/NCR."
            }
        ]
    },

    "temperature_2m": {
        "label": "Air Temperature",
        "importance_rank": 3,
        "check": lambda w: w.get("temperature_2m", 0),
        "thresholds": [
            {
                "min": 44,
                "impact": "high",
                "explanation": "Extreme heat at {value:.1f}°C. Transformer oil breakdown and conductor sagging become critical risks above 44°C."
            },
            {
                "min": 40,
                "impact": "high",
                "explanation": "Severe heat at {value:.1f}°C is pushing transformers toward thermal limits, especially if sustained over multiple hours."
            },
            {
                "min": 35,
                "impact": "medium",
                "explanation": "Elevated temperature at {value:.1f}°C is increasing grid demand from cooling loads (ACs, coolers), straining transformer capacity."
            },
        ]
    },

    "wind_gusts_10m": {
        "label": "Wind Gusts",
        "importance_rank": 4,
        "check": lambda w: w.get("wind_gusts_10m", 0),
        "thresholds": [
            {
                "min": 50,
                "impact": "high",
                "explanation": "Dangerous wind gusts of {value:.0f} km/h risk snapping power lines, toppling poles, and blowing debris into transformers."
            },
            {
                "min": 30,
                "impact": "medium",
                "explanation": "Strong wind gusts of {value:.0f} km/h increase the risk of tree branches falling on power lines and conductor clashing."
            },
            {
                "min": 20,
                "impact": "low",
                "explanation": "Moderate wind gusts of {value:.0f} km/h. Minor risk of loose connections being disturbed."
            },
        ]
    },

    "surface_pressure": {
        "label": "Atmospheric Pressure",
        "importance_rank": 5,
        "check": lambda w: w.get("surface_pressure", 1013),
        "thresholds": [
            {
                "max": 1000,
                "impact": "high",
                "explanation": "Low atmospheric pressure ({value:.0f} hPa) signals an approaching storm system, often bringing sudden rain, wind, and lightning."
            },
            {
                "max": 1005,
                "impact": "medium",
                "explanation": "Below-normal pressure ({value:.0f} hPa) indicates unsettled weather conditions that may develop into storms."
            },
        ]
    },

    "precipitation": {
        "label": "Rainfall",
        "importance_rank": 6,
        "check": lambda w: w.get("precipitation", 0),
        "thresholds": [
            {
                "min": 10,
                "impact": "high",
                "explanation": "Heavy rainfall of {value:.1f} mm/hr risks waterlogging substations, flooding underground cables, and short-circuiting poorly weatherproofed equipment."
            },
            {
                "min": 5,
                "impact": "medium",
                "explanation": "Moderate rainfall of {value:.1f} mm/hr. Indian distribution infrastructure is vulnerable to water ingress at joints and junction boxes."
            },
            {
                "min": 2,
                "impact": "low",
                "explanation": "Light rainfall of {value:.1f} mm/hr. Minor risk of moisture-related faults in aging equipment."
            },
        ]
    },

    "is_peak_hour": {
        "label": "Peak Demand Hour",
        "importance_rank": 7,
        "check": lambda w: 1 if w.get("hour_of_day", 12) in list(range(6, 11)) + list(range(18, 23)) else 0,
        "thresholds": [
            {
                "min": 1,
                "impact": "medium",
                "explanation": "Current time falls within peak demand hours (6–10 AM or 6–10 PM), when residential AC/cooler usage maximizes grid load."
            }
        ]
    },

    "consecutive_hot_hours": {
        "label": "Sustained Heat Duration",
        "importance_rank": 8,
        "check": lambda w: w.get("consecutive_hot_hours", 0),
        "thresholds": [
            {
                "min": 8,
                "impact": "high",
                "explanation": "{value:.0f} consecutive hours above 35°C. Prolonged heat prevents transformer oil from cooling overnight, causing cumulative thermal damage."
            },
            {
                "min": 4,
                "impact": "medium",
                "explanation": "{value:.0f} consecutive hot hours. Transformers are accumulating heat stress without adequate cool-down periods."
            },
        ]
    },

    "is_monsoon": {
        "label": "Monsoon Season",
        "importance_rank": 9,
        "check": lambda w: 1 if w.get("month", 1) in [7, 8, 9] else 0,
        "thresholds": [
            {
                "min": 1,
                "impact": "medium",
                "explanation": "We are in the Monsoon season (Jul–Sep). While temperatures are lower, heavy rain and flooding cause a different type of grid failure — water damage to poorly maintained infrastructure."
            }
        ]
    },

    "cloud_cover": {
        "label": "Cloud Cover",
        "importance_rank": 10,
        "check": lambda w: w.get("cloud_cover", 0),
        "thresholds": [
            {
                "min": 90,
                "impact": "low",
                "explanation": "Near-total cloud cover ({value:.0f}%) indicates overcast skies, often a precursor to rain or storms."
            },
        ]
    },
}


# ─────────────────────────────────────────────
# MAIN FUNCTION
# ─────────────────────────────────────────────

def generate_explanation(
    weather_data: dict,
    adjusted_risk: float,
    risk_level: str,
    city_name: str,
    discom: str,
    fragility: float,
    rain_adjustment_applied: bool = False,
) -> dict:
    """
    Generates a human-readable explanation of why the AI predicted
    a certain risk level.

    Parameters
    ----------
    weather_data : dict
        The raw weather values (temperature_2m, precipitation, etc.)
    adjusted_risk : float
        The final risk percentage after all adjustments (e.g., 42.5)
    risk_level : str
        One of: LOW, MODERATE, HIGH, CRITICAL
    city_name : str
        e.g., "Lucknow"
    discom : str
        e.g., "MVVNL"
    fragility : float
        e.g., 1.13
    rain_adjustment_applied : bool
        Whether the rain hazard multiplier was used

    Returns
    -------
    dict with keys: "factors" (list) and "summary" (str)
    """

    # Step 1: Check every feature rule against the current weather
    triggered_factors = []

    for feature_name, rule in FEATURE_RULES.items():
        value = rule["check"](weather_data)

        # Try each threshold from most severe to least severe
        for threshold in rule["thresholds"]:
            matched = False

            # Some thresholds use "min" (value must be above X)
            if "min" in threshold and value >= threshold["min"]:
                matched = True
            # Some use "max" (value must be below X) — e.g., low pressure
            elif "max" in threshold and value <= threshold["max"]:
                matched = True

            if matched:
                triggered_factors.append({
                    "feature": feature_name,
                    "label": rule["label"],
                    "value": round(value, 2),
                    "impact": threshold["impact"],
                    "importance_rank": rule["importance_rank"],
                    "explanation": threshold["explanation"].format(value=value),
                })
                break  # Only take the highest severity match per feature

    # Step 2: Sort by importance (most important features first)
    triggered_factors.sort(key=lambda f: f["importance_rank"])

    # Step 3: Take the top 5 factors for the response
    top_factors = triggered_factors[:5]

    # Step 4: Build the summary sentence
    summary = _build_summary(
        top_factors, adjusted_risk, risk_level,
        city_name, discom, fragility, rain_adjustment_applied
    )

    # Step 5: Clean up the response (remove the sort key)
    for factor in top_factors:
        del factor["importance_rank"]

    return {
        "factors": top_factors,
        "summary": summary,
    }


def _build_summary(
    factors, adjusted_risk, risk_level,
    city_name, discom, fragility, rain_adjustment_applied
):
    """Builds a 1-2 sentence plain-English summary from the top factors."""

    if not factors:
        return (
            f"Risk is {risk_level} ({adjusted_risk:.1f}%) for {city_name}. "
            f"No single weather factor is dominant — conditions are broadly stable."
        )

    # Grab the top 2 factor labels for the summary
    top_labels = [f["label"].lower() for f in factors[:2]]

    # Start the summary
    summary = f"Risk is {risk_level} ({adjusted_risk:.1f}%) "

    if len(top_labels) == 1:
        summary += f"primarily due to {top_labels[0]}."
    else:
        summary += f"due to {top_labels[0]} and {top_labels[1]}."

    # Add fragility context
    if fragility > 1.05:
        summary += (
            f" Infrastructure fragility for {city_name} "
            f"({discom}, score {fragility:.2f}) is amplifying "
            f"the base weather risk by {((fragility - 1) * 100):.0f}%."
        )
    elif fragility < 0.95:
        summary += (
            f" {city_name}'s relatively strong infrastructure "
            f"({discom}, score {fragility:.2f}) is reducing "
            f"the base weather risk by {((1 - fragility) * 100):.0f}%."
        )

    # Add rain adjustment note
    if rain_adjustment_applied:
        summary += (
            " A rain hazard adjustment has been applied to account for "
            "Indian infrastructure's vulnerability to water damage."
        )

    return summary
