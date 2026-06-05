import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { timezoneSchema } from "@app/lib/api/timezone";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  aId: z.string(),
});

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  interval: z.enum(["day", "week"]).optional().default("day"),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/usage-metrics.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const assistant = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    const { days, interval, timezone } = ctx.req.valid("query");
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve usage metrics: ${fromError(usageMetricsResult.error).toString()}`,
        },
      });
    }

    return ctx.json({ interval, points: usageMetricsResult.value });
  }
);

export default app;
