import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { formatUTCDateFromMillis } from "@app/lib/api/elasticsearch";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { stringify } from "csv-stringify/sync";
import { Hono } from "hono";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/usage-metrics-export.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const { days } = c.req.valid("query");
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
    return apiError(c, {
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

  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    `attachment; filename="dust_activity_last_${days}_days.csv"`
  );
  return c.body(csv);
});

export default app;
