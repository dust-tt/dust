import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetWorkspaceToolUsageResponse } from "@app/lib/api/assistant/observability/tool_usage";
import { fetchToolUsageMetrics } from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { timezoneSchema } from "@app/lib/api/timezone";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  serverName: z.string().optional(),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/analytics/tool-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, serverName, timezone } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const usageResult = await fetchToolUsageMetrics(
    baseQuery,
    serverName ?? null,
    timezone
  );

  if (usageResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve tool usage metrics: ${usageResult.error.message}`,
      },
    });
  }

  const body: GetWorkspaceToolUsageResponse = { points: usageResult.value };
  return ctx.json(body);
});

export default app;
