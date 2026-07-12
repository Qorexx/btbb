import { cronJobs } from "convex/server";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const CITIES = [
  { id: "lucknow", name: "Lucknow", lat: 26.85, lon: 80.95 },
  { id: "noida", name: "Noida", lat: 28.57, lon: 77.32 },
  { id: "ghaziabad", name: "Ghaziabad", lat: 28.67, lon: 77.42 },
  { id: "agra", name: "Agra", lat: 27.18, lon: 78.02 },
  { id: "firozabad", name: "Firozabad", lat: 27.15, lon: 78.39 },
  { id: "meerut", name: "Meerut", lat: 28.98, lon: 77.71 },
];

/**
 * Background Action: Fetch weather, call ML service, and save prediction.
 */
export const runPredictionForAllCities = internalAction({
  args: {},
  handler: async (ctx) => {
    // Note: You must set ML_SERVICE_URL in the Convex Dashboard > Settings > Environment Variables
    // (e.g., https://btbb-ml-service.onrender.com)
    const mlServiceUrl = process.env.ML_SERVICE_URL;
    
    if (!mlServiceUrl) {
      console.error("ML_SERVICE_URL environment variable is missing. Skipping predictions.");
      return;
    }

    const currentTimestamp = Date.now();

    for (const city of CITIES) {
      try {
        // 1. Fetch current weather from Open-Meteo
        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,cloud_cover,surface_pressure,wind_gusts_10m,dewpoint_2m,shortwave_radiation,weather_code`;
        const weatherResponse = await fetch(openMeteoUrl);
        const weatherData = await weatherResponse.json();

        if (!weatherData.current) {
          console.error(`Failed to fetch weather for ${city.name}`);
          continue;
        }

        // Format weather for our Python service
        const currentWeather = {
          timestamp: currentTimestamp,
          ...weatherData.current,
        };

        // 2. Fetch the rolling 24-hour history from our Convex Database
        const cachedHistory = await ctx.runQuery(internal.predictions.getWeatherHistory, {
          cityId: city.id,
        });

        // 3. Send all data to our Python ML Service
        const predictionResponse = await fetch(`${mlServiceUrl}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city_id: city.id,
            current_weather: currentWeather,
            cached_history: cachedHistory,
          }),
        });

        if (!predictionResponse.ok) {
          console.error(`ML Service returned error for ${city.name}`);
          continue;
        }

        const prediction = await predictionResponse.json();

        // 4. Save the new weather reading for future rolling averages
        await ctx.runMutation(internal.predictions.saveWeather, {
          cityId: city.id,
          timestamp: currentTimestamp,
          temperature_2m: currentWeather.temperature_2m,
          surface_pressure: currentWeather.surface_pressure,
        });

        // 5. Save the final ML Prediction so the frontend can display it in real-time
        await ctx.runMutation(internal.predictions.savePrediction, {
          cityId: city.id,
          timestamp: currentTimestamp,
          riskLevel: prediction.risk_level,
          rawRisk: prediction.raw_risk,
          adjustedRisk: prediction.adjusted_risk,
          rainAdjustmentApplied: prediction.rain_adjustment_applied,
          explanation: prediction.explanation,
        });

        console.log(`Successfully generated prediction for ${city.name}: ${prediction.risk_level}`);
      } catch (error) {
        console.error(`Error processing ${city.name}:`, error);
      }
    }
  },
});

const crons = cronJobs();

// Schedule the action to run at the top of every hour
crons.hourly(
  "hourly-risk-predictions",
  internal.crons.runPredictionForAllCities,
);

export default crons;
