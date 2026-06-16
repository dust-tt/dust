import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetWorkspaceSkillUsageResponse } from "@app/lib/api/analytics/workspace_analytics";
import { fetchSkillUsageMetrics } from "@app/lib/api/assistant/observability/skill_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { timezoneSchema } from "@app/lib/api/timezone";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  skillName: z.string().optional(),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/analytics/skill-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasPermission("workspace:view_analytics"),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { days, skillName, timezone } = ctx.req.valid("query");
    const owner = auth.getNonNullableWorkspace();

    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      days,
    });

    const usageResult = await fetchSkillUsageMetrics(
      baseQuery,
      skillName ?? null,
      timezone
    );

    if (usageResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve skill usage metrics: ${usageResult.error.message}`,
        },
      });
    }

    const body: GetWorkspaceSkillUsageResponse = { points: usageResult.value };
    return ctx.json(body);
  }
);

export default app;
