import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Citizen Reports API
 * -------------------
 * Functions for submitting and retrieving grid issue reports.
 * Designed perfectly for a React dashboard (queries) and mobile app (mutations).
 */

// 1. Submit a new report (Used by the citizen-facing app)
export const submitReport = mutation({
  args: {
    cityId: v.string(),
    reportType: v.union(
      v.literal("outage"),
      v.literal("voltage_fluctuation"),
      v.literal("sparking"),
      v.literal("infrastructure_damage")
    ),
    description: v.string(),
    lat: v.optional(v.float64()),
    lon: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    // Optionally link the report to a logged-in user
    const userId = await getAuthUserId(ctx);

    const reportId = await ctx.db.insert("citizen_reports", {
      ...args,
      userId: userId ?? undefined,
      status: "pending", // All new reports start as pending
    });

    return reportId;
  },
});

// 2. Get recent reports (Used by the admin dashboard)
export const getRecent = query({
  args: {
    cityId: v.optional(v.string()), // Pass a cityId to filter, or undefined for all
    status: v.optional(v.union(
      v.literal("pending"), 
      v.literal("verified"), 
      v.literal("resolved")
    )),
  },
  handler: async (ctx, args) => {
    let reportsQuery = ctx.db.query("citizen_reports").order("desc");

    // Apply city filter using our schema index if provided
    if (args.cityId) {
      reportsQuery = ctx.db
        .query("citizen_reports")
        .withIndex("by_city", (q) => q.eq("cityId", args.cityId!))
        .order("desc");
    }

    let reports = await reportsQuery.take(100);

    // Apply status filter in-memory if provided
    if (args.status) {
      reports = reports.filter((r) => r.status === args.status);
    }

    return reports;
  },
});

// 3. Update report status (Used by the admin dashboard)
export const updateStatus = mutation({
  args: {
    reportId: v.id("citizen_reports"),
    status: v.union(
      v.literal("pending"), 
      v.literal("verified"), 
      v.literal("resolved")
    ),
  },
  handler: async (ctx, args) => {
    // In a real production app, we would check if the user is an admin here
    // const userId = await getAuthUserId(ctx);
    // if (!userId) throw new Error("Unauthorized");
    
    await ctx.db.patch(args.reportId, { status: args.status });
  },
});
