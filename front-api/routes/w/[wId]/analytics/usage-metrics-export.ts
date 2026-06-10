import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { formatUTCDateFromMillis } from "@app/lib/api/elasticsearch";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/usage-metrics-export.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasPermission("workspace:view_analytics"),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { days } = ctx.req.valid("query");
    const owner = auth.getNonNullableWorkspace();
    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      days,
    });

    const result = await fetchMessageMetrics(baseQuery, "day", [
      "conversations",
      "activeUsers",
    ] as const);

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve usage metrics: ${result.error.message}`,
        },
      });
    }

    const headers = ["date", "messages", "conversations", "activeUsers"];
    const csvData = result.value.map((point) => [
      formatUTCDateFromMillis(point.timestamp),
      point.count,
      point.conversations,
      point.activeUsers,
    ]);
    const csv = stringify([headers, ...csvData], { header: false });

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_activity_last_${days}_days.csv"`
    );
    return ctx.body(csv);
  }
);

export default app;
