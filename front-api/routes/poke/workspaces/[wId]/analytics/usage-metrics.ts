import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type {
  MessageMetricsPoint,
  UsageMetricsInterval,
} from "@app/lib/api/assistant/observability/messages_metrics";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  buildAgentAnalyticsBaseQuery,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  interval: z.enum(["day", "week"]).optional().default("day"),
  timezone: timezoneSchema,
});

export type PokeGetWorkspaceUsageMetricsResponse = {
  interval: UsageMetricsInterval;
  points: Pick<
    MessageMetricsPoint,
    "timestamp" | "count" | "conversations" | "activeUsers"
  >[];
};

// Mounted at /api/poke/workspaces/:wId/analytics/usage-metrics.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const { days, interval, timezone } = ctx.req.valid("query");

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const usageMetricsResult = await fetchMessageMetrics(
    baseQuery,
    interval,
    ["conversations", "activeUsers"] as const,
    timezone
  );

  if (usageMetricsResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve usage metrics: ${fromError(usageMetricsResult.error).toString()}`,
      },
    });
  }

  const body: PokeGetWorkspaceUsageMetricsResponse = {
    interval,
    points: usageMetricsResult.value,
  };
  return ctx.json(body);
});

export default app;
