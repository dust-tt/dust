import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { generateAgentObservabilitySummary } from "@app/lib/api/assistant/observability/summary";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/summary.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";
  const owner = auth.getNonNullableWorkspace();

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

  const { days } = ctx.req.valid("query");

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: assistant.sId,
    days,
  });

  const summaryResult = await generateAgentObservabilitySummary({
    auth,
    baseQuery,
    days,
    agentName: assistant.name,
  });
  if (summaryResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to generate observability summary: ${fromError(summaryResult.error).toString()}`,
      },
    });
  }

  return ctx.json({ summaryText: summaryResult.value.summaryText });
});

export default app;
