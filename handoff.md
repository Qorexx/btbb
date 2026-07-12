# Project Context: Beyond the Black Box

This document provides the context of the backend architecture we just finished building. 

## What We've Built (The Backend)

We have a two-part architecture:

### 1. The Convex Cloud Backend (`/web/convex/`)
- **Database Schema (`schema.ts`):** 
  - `citizen_reports`: Tracks crowdsourced grid issues (outage, voltage fluctuation, etc.) with statuses (pending, verified, resolved).
  - `predictions`: Stores ML risk scores (LOW, MODERATE, HIGH, CRITICAL) and plain-English explanations.
  - Auth is handled by `@convex-dev/auth` via Google Login.
- **Frontend APIs (`reports.ts` & `predictions.ts`):**
  - Exposed queries (`getLatest`, `getRecent`) and mutations (`submitReport`, `updateStatus`).
- **Automated Pipeline (`crons.ts`):**
  - An hourly cron job fetches live weather and ML predictions, saving them to Convex.

### 2. The Python ML Service (`/ml-service/`)
- A standalone FastAPI + XGBoost microservice that calculates grid failure risk based on weather data.

---

## Instructions for the Agent

**CRITICAL:** Do NOT write any code, do NOT run any scaffolding commands, and do NOT try to build the frontend right away. The user wants to maintain strict, step-by-step control over the development process to prevent breakages.

**Your FIRST task:** 
Only discuss the aesthetics, vibe, and design of the frontend with the user. Do nothing else. Ask the user what kind of design aesthetics they want for the dashboard before proceeding any further.
