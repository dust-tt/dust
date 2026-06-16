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
  version: z.string().optional(),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/error_rate.
const app = workspaceApp();

/** @ignoreswagger */
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

    const { days, version, timezone } = ctx.req.valid("query");
    const owner = auth.getNonNullableWorkspace();

    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      agentId: assistant.sId,
      days,
      version,
    });

    const errorRateResult = await fetchMessageMetrics(
      baseQuery,
      "day",
      ["failedMessages", "errorRate"] as const,
      timezone
    );
    if (errorRateResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve error rate: ${fromError(errorRateResult.error).toString()}`,
        },
      });
    }

    return ctx.json({ points: errorRateResult.value });
  }
);

export default app;
