import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  buildAgentAnalyticsBaseQuery,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  interval: z.enum(["day", "week"]).optional().default("day"),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/usage-metrics.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  const { days, interval, timezone } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: assistant.sId,
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

  return c.json({ interval, points: usageMetricsResult.value });
});

export default app;
