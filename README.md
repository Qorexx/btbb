# DrishtiX

AI-powered power outage prediction for the Uttar Pradesh and National Capital Region (UP/NCR) in India. DrishtiX combines an XGBoost classifier trained on real US outage data with a live application stack that fetches weather, scores grid failure risk, and surfaces explainable predictions through a web dashboard.

---

## Introduction

Power distribution in UP/NCR is sensitive to weather, but simple threshold rules (for example, wind speed above a fixed cutoff) do not capture non-linear interactions such as sustained heat combined with high humidity degrading transformer performance over time.

DrishtiX addresses this by:

1. Training an XGBoost classifier on labeled US outage data from the EAGLE-I dataset, using cross-continental transfer learning under the assumption that grid failure physics (thermal overload, wind stress) generalize across regions.
2. Applying region-specific adjustments for Indian conditions, including DISCOM-based infrastructure fragility multipliers and a rain hazard calibration layer.
3. Serving predictions through a FastAPI microservice, a Convex backend with hourly cron jobs, and a React dashboard for monitoring and citizen reporting.

**Target cities:** Lucknow, Noida, Ghaziabad, Agra, Meerut, Firozabad.

The system is designed to operate on public data sources (Open-Meteo weather, UPERC/PFC DISCOM reports, EAGLE-I outage records) without requiring proprietary utility sensor access.

---

## Core Features

| Feature | Description |
|---|---|
| Weather-driven outage prediction | XGBoost v2 model with 26 engineered features; outputs hourly failure probability per city |
| Risk classification | Four levels: LOW, MODERATE, HIGH, CRITICAL |
| Explainable output | Plain-English summaries and ranked contributing factors per prediction |
| Infrastructure fragility scoring | Per-city multipliers derived from official DISCOM distribution loss data |
| Rain hazard calibration | Tiered multipliers to correct US-trained model bias against Indian rain/wind failure patterns |
| Offline ML pipeline | Scripts for data filtering, feature engineering, training, MRMR analysis, and batch inference |
| Live prediction service | FastAPI endpoint (`POST /predict`) for real-time scoring |
| Automated data pipeline | Convex hourly cron fetches weather, calls the ML service, and stores results |
| Citizen reporting | Users can submit and track outage-related reports (outage, voltage fluctuation, sparking, infrastructure damage) |
| Real-time dashboard | React frontend with per-city risk display, history charts, and report management |

---

## Architecture

### System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Dashboard (web/)                   │
│   City selection · Risk display · Reports · History charts      │
└────────────────────────────┬────────────────────────────────────┘
                             │ Convex queries / mutations
┌────────────────────────────▼────────────────────────────────────┐
│                    Convex Backend (web/convex/)                 │
│   predictions · citizen_reports · weather_cache · auth          │
│   Hourly cron → Open-Meteo → ML Service → save results          │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /predict
┌────────────────────────────▼────────────────────────────────────┐
│                   FastAPI ML Service (ml-service/)              │
│   Feature engineering · XGBoost inference · Rain adjustment     │
│   Fragility multiplier · Explainability generation              │
└────────────────────────────┬────────────────────────────────────┘
                             │ loads at startup
┌────────────────────────────▼────────────────────────────────────┐
│                   Trained Model (models/)                       │
│   xgboost_model_v2.json · fragility_scores.json · model_config  │
└─────────────────────────────────────────────────────────────────┘
```

### Cross-continental transfer learning

No publicly available Indian outage dataset exists at the granularity required for supervised training. DrishtiX trains on real US outage events and applies the learned model to Indian weather:

```
US weather + EAGLE-I outage labels  →  XGBoost training  →  Trained model
Indian weather (Open-Meteo)       →  Trained model     →  Raw risk scores
                                                      ↓
                                        Rain hazard adjustment
                                                      ↓
                                        DISCOM fragility multiplier
                                                      ↓
                                        Adjusted risk + explanation
```

### Data sources

| Source | Role |
|---|---|
| [EAGLE-I Dataset](https://eagle-i.doe.gov/) (US DOE/ORNL) | County-level US outage events at 15-minute intervals (2023); filtered to six climate-matched US states |
| [Open-Meteo API](https://open-meteo.com/) | Hourly historical and forecast weather (ERA5 reanalysis) for US training cities and UP/NCR targets |
| UPERC/PFC Reports (FY 2023-24) | Official DISCOM distribution loss data for infrastructure fragility scoring |

### ML pipeline (offline)

The `src/` directory contains the batch training and inference pipeline:

| Stage | Scripts | Output |
|---|---|---|
| Data preparation | `filter_eagle_i.py`, `fetch_us_weather.py`, `engineer_us_features.py` | Filtered US outage data merged with weather features |
| Model training | `train_model.py`, `enhance_and_retrain.py`, `mrmr_selection.py` | `xgboost_model.json` (v1, 13 features), `xgboost_model_v2.json` (v2, 26 features) |
| Indian inference | `fetch_weather.py`, `feature_engineering.py`, `inference.py`, `inference_v2.py` | Hourly risk scores for six UP/NCR cities |

### Model configuration

**Algorithm:** XGBoost classifier with cost-sensitive learning (`scale_pos_weight = 6.37`) to address 13.6% positive-class imbalance.

**v2 performance (threshold = 0.55):**

| Metric | Value |
|---|---|
| Accuracy | 74.4% |
| Recall | 51.6% |
| Precision | 27.0% |
| F1 Score | 0.354 |

The model is tuned for higher recall at the cost of precision. For an alerting system, missing a real outage is weighted more heavily than issuing a false warning.

**Top features (v2):** `temp_x_humidity`, `is_summer`, `month`, `surface_pressure`, `is_monsoon`

**Risk thresholds:**

| Level | Probability |
|---|---|
| LOW | below 30% |
| MODERATE | 30% to 50% |
| HIGH | 50% to 70% |
| CRITICAL | 70% and above |

### Infrastructure fragility scores

Derived from UPERC/PFC FY 2023-24 DISCOM distribution loss data. Same raw weather risk produces different adjusted scores depending on local grid quality.

| City | DISCOM | Fragility Score |
|---|---|---|
| Noida | PVVNL (A+) | 0.93 |
| Ghaziabad | PVVNL (A+) | 1.00 |
| Meerut | PVVNL (A+) | 1.07 |
| Lucknow | MVVNL (B-) | 1.13 |
| Agra | DVVNL (B-) | 1.27 |
| Firozabad | DVVNL (B-) | 1.40 |

### Rain hazard calibration

The US-trained model underweights rain and wind as failure drivers relative to Indian grid conditions. The ML service applies tiered multipliers to raw risk before fragility adjustment:

| Condition | Multiplier |
|---|---|
| Light rain (0 to 2 mm) | 1.10x |
| Moderate rain (2 to 5 mm) | 1.20x |
| Heavy rain (above 5 mm) | 1.30x |
| Rain above 2 mm with wind above 15 km/h | 1.40x |

See `Research/rain_calibration.md` for the calibration analysis.

---

## Installation

### Prerequisites

- Python 3.10+
- Node.js 18+ (for the web frontend)
- Convex account (for backend deployment)
- Approximately 2 GB disk space for training data files (not included in the repository)

### Clone the repository

```bash
git clone https://github.com/amisha-srivastavaa/DrishtiX.git
cd DrishtiX
```

### ML training environment

Create a Python virtual environment and install dependencies for the offline pipeline:

```bash
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

pip install pandas numpy xgboost scikit-learn matplotlib mrmr requests
```

### ML service (inference API)

```bash
cd ml-service
pip install -r requirements.txt
```

The service loads `models/xgboost_model_v2.json` from the parent directory at startup.

### Web application

```bash
cd web
npm install
```

Set up Convex and link the project:

```bash
npx convex dev
# Follow prompts to create or link a Convex project
```

Configure authentication and environment variables in the Convex dashboard:

```bash
# Required in Convex Dashboard > Settings > Environment Variables
ML_SERVICE_URL=<your-deployed-ml-service-url>

# Additional auth variables per your Convex Auth provider setup
# e.g., AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
```

### Training data setup

Large CSV files are excluded from the repository. Place them in a `data/` directory at the project root:

```
data/
├── outage_data_2023.csv       # Raw EAGLE-I dataset (~1.2 GB)
├── eagle_i_filtered.csv       # Filtered to 6 US states (~77 MB)
├── us_training_data.csv       # Outage + weather merged (~135 MB)
├── us_training_final.csv      # v1 engineered features (~186 MB)
├── us_training_v2.csv         # v2 engineered features (~354 MB)
├── weather_data.csv           # UP/NCR raw weather (~5 MB)
├── engineered_data.csv        # UP/NCR engineered features (~7.7 MB)
├── up_predictions.csv         # v1 batch predictions
└── up_predictions_v2.csv      # v2 batch predictions
```

---

## Usage

### Offline ML pipeline

Run scripts from the project root with the virtual environment active. Stages are sequential.

```bash
# Stage 1: Prepare US training data
python src/filter_eagle_i.py
python src/fetch_us_weather.py
python src/engineer_us_features.py

# Stage 2: Train and evaluate models
python src/train_model.py
python src/enhance_and_retrain.py
python src/mrmr_selection.py

# Stage 3: Generate predictions for UP/NCR cities
python src/fetch_weather.py
python src/feature_engineering.py
python src/inference_v2.py
```

### ML service (local)

```bash
cd ml-service
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Example request:

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "city_id": "lucknow",
    "current_weather": {
      "timestamp": 1713369600000,
      "temperature_2m": 38.0,
      "relative_humidity_2m": 72,
      "precipitation": 0.5,
      "wind_speed_10m": 15.0,
      "cloud_cover": 80,
      "surface_pressure": 1005.0,
      "wind_gusts_10m": 22.0,
      "dewpoint_2m": 28.0,
      "shortwave_radiation": 450.0,
      "weather_code": 95
    },
    "cached_history": []
  }'
```

Deploy the service to a cloud host (Render, Railway, or similar) and set `ML_SERVICE_URL` in Convex to the deployed endpoint.

### Web dashboard (local development)

```bash
cd web
npx convex dev    # Terminal 1: Convex backend
npm run dev       # Terminal 2: Vite dev server
```

The dashboard subscribes to the `predictions` table for live updates when the hourly cron is active. A simulation mode with static mock data is available when Convex is not connected.

### Deploy ML service

```bash
# Example: deploy to Render / Railway
# Set start command:
uvicorn main:app --host 0.0.0.0 --port $PORT
```

---

## Project Structure

```
DrishtiX/
├── src/                        # Offline ML pipeline scripts
├── ml-service/                 # FastAPI inference microservice
│   ├── main.py                 # API entry point
│   ├── model.py                # Feature engineering and prediction
│   ├── explainability.py       # Plain-English explanation generation
│   └── config.py               # City, feature, and threshold configuration
├── web/                        # React + Convex application
│   ├── src/                    # Frontend components
│   └── convex/                 # Database schema, crons, queries, mutations
├── models/                     # Trained model artifacts (committed)
├── data/                       # Training data (gitignored; see Installation)
├── Research/                   # Papers, calibration notes, project documentation
├── android-app (reference)/  # Reference mobile app scaffold
└── README.md
```

---

## Research Foundation

Architecture and methodology are informed by four primary papers:

1. **Ghasemkhani et al. (2024)** — XGBoost with MRMR feature selection for outage duration prediction. Primary blueprint for model choice and evaluation framing. [DOI: 10.3390/s24134313](https://doi.org/10.3390/s24134313)
2. **Wang et al. (2024)** — Weather-related outage prediction with socio-economic and infrastructure data. Basis for the fragility multiplier approach. [arXiv: 2404.03115](https://arxiv.org/abs/2404.03115)
3. **Fatehi et al. (2024)** — LSTM-based temporal models. Documented as a future upgrade path (LSTM-XGBoost hybrid).
4. **Chen et al. (2025)** — Graph Neural Networks for spatial outage cascade modeling. Documented as future scope.

Additional technical documentation: [`Research/project_progress.md`](Research/project_progress.md)

---

## Known Limitations

1. **Transfer learning gap** — The model learns US failure patterns where heat is the primary driver. Indian outages are also driven by rain, overloaded transformers, and maintenance gaps.
2. **Weather-only features** — No utility-specific inputs (equipment age, maintenance logs, load curves).
3. **Precision trade-off** — Recall-focused tuning produces a high false-alarm rate relative to actual outages.
4. **Class imbalance** — Outage events represent 13.6% of US training data, which limits achievable precision.
5. **Scheduled outage detection** — UPPCL notice integration is planned but not yet implemented in the live pipeline.

---

## Roadmap

| Task | Status |
|---|---|
| Data pipeline (filter, merge, engineer) | Complete |
| XGBoost v1 and v2 training | Complete |
| MRMR feature selection analysis | Complete |
| Threshold optimization | Complete |
| Infrastructure fragility scoring | Complete |
| Rain hazard calibration layer | Complete |
| FastAPI ML service | Complete |
| Convex backend and hourly cron | Complete |
| React dashboard | Complete |
| Scheduled outage prediction (UPPCL notices) | Pending |
| Push notification system | Pending |
| Real-time 24 to 48 hour forecast mode | Pending |
| LSTM temporal layer | Future scope |
| Graph Neural Network cascade modeling | Future scope |

---

## Team

Team NERV

---

## License

Academic / hackathon project. Contact the repository owner for usage terms.
