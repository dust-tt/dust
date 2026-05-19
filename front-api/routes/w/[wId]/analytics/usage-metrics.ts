import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

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

  const { days, interval, timezone } = c.req.valid("query");
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
    return apiError(c, {
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
  return c.json(body);
});

export default app;
