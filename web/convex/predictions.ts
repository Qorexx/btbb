import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

/**
 * Predictions API
 * ---------------
 * Functions for retrieving ML risk predictions to display on the dashboard.
 */

export const getLatest = query({
  args: { cityId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("predictions")
      .withIndex("by_city_and_time", (q) => q.eq("cityId", args.cityId))
      .order("desc")
      .first();
  },
});

export const getHistory = query({
  args: {
    cityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("predictions")
      .withIndex("by_city_and_time", (q) => q.eq("cityId", args.cityId))
      .order("desc")
      .take(args.limit ?? 24);
    return history.reverse();
  },
});

export const savePrediction = internalMutation({
  args: {
    cityId: v.string(),
    timestamp: v.number(),
    riskLevel: v.union(v.literal("LOW"), v.literal("MODERATE"), v.literal("HIGH"), v.literal("CRITICAL")),
    rawRisk: v.float64(),
    adjustedRisk: v.float64(),
    rainAdjustmentApplied: v.boolean(),
    explanation: v.object({
      summary: v.string(),
      factors: v.array(
        v.object({
          feature: v.string(),
          label: v.string(),
          value: v.float64(),
          impact: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
          explanation: v.string(),
        })
      ),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("predictions", args);
  },
});

// --- Internal Weather Cache Functions for Cron Jobs ---

export const getWeatherHistory = internalQuery({
  args: { cityId: v.string() },
  handler: async (ctx, args) => {
    // Return the last 24 hours of weather data
    const history = await ctx.db
      .query("weather_cache")
      .withIndex("by_city_and_time", (q) => q.eq("cityId", args.cityId))
      .order("desc")
      .take(24);
    return history.reverse();
  },
});

export const saveWeather = internalMutation({
  args: {
    cityId: v.string(),
    timestamp: v.number(),
    temperature_2m: v.float64(),
    surface_pressure: v.float64(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("weather_cache", args);
  },
});
