import {
  AwuUsageAnalyticsExportQuerySchema,
  type AwuUsageAnalyticsResponse,
  awuUsageAnalyticsToCsv,
  getAwuUsageFromAnalytics,
} from "@app/lib/api/analytics/awu_usage_analytics";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { AwuUsageAnalyticsResponse };

// Mounted at /api/poke/workspaces/:wId/analytics/awu-usage-analytics.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", AwuUsageAnalyticsExportQuerySchema),
  async (ctx) => {
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

    const { csv, filename } = awuUsageAnalyticsToCsv({
      response: result.value,
      series,
      days: query.days,
    });
    ctx.header("Content-Type", "text/csv");
    ctx.header("Content-Disposition", `attachment; filename="${filename}"`);
    return ctx.body(csv);
  }
);

export default app;
