import {
  AwuUsageAnalyticsQuerySchema,
  type AwuUsageAnalyticsResponse,
  getAwuUsageFromAnalytics,
} from "@app/lib/api/analytics/awu_usage_analytics";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { AwuUsageAnalyticsResponse };

const CSV_HEADERS = ["date", "granularity", "series", "credits"] as const;

const QuerySchema = AwuUsageAnalyticsQuerySchema.extend({
  format: z.enum(["json", "csv"]).optional().default("json"),
  // Comma-separated group keys to restrict the export to, mirroring the chart's
  // legend drilldown. Absent means all returned series.
  series: z.string().optional(),
});

const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { format, series, ...query } = ctx.req.valid("query");

  const result = await getAwuUsageFromAnalytics(auth, query);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  if (format === "json") {
    return ctx.json(result.value);
  }

  const { groups, points } = result.value;
  const seriesFilter = series ? new Set(series.split(",")) : null;
  const visibleGroups = seriesFilter
    ? groups.filter((group) => seriesFilter.has(group.groupKey))
    : groups;
  const rows = points.flatMap((point) => {
    const date = new Date(point.timestamp).toISOString().slice(0, 10);
    return visibleGroups.map((group) => ({
      date,
      granularity: query.granularity,
      series: group.name,
      credits: point.values[group.groupKey] ?? 0,
    }));
  });

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_credit_usage_last_${query.days}_days.csv"`
  );
  return ctx.body(rowsToCsv(CSV_HEADERS, rows));
});

export default app;
