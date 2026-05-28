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
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  interval: z.enum(["day", "week"]).optional().default("day"),
  timezone: timezoneSchema,
});

export type GetWorkspaceUsageMetricsResponse = {
  interval: UsageMetricsInterval;
  points: Pick<
    MessageMetricsPoint,
    "timestamp" | "count" | "conversations" | "activeUsers"
  >[];
};

// Mounted at /api/w/:wId/analytics/usage-metrics.
const app = workspaceApp();

app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, interval, timezone } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

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

  const body: GetWorkspaceUsageMetricsResponse = {
    interval,
    points: usageMetricsResult.value,
  };
  return ctx.json(body);
});

export default app;
