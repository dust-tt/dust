import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { AvailableSkill } from "@app/lib/api/assistant/observability/skill_usage";
import { fetchAvailableSkills } from "@app/lib/api/assistant/observability/skill_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type GetWorkspaceSkillsResponse = {
  skills: AvailableSkill[];
};

// Mounted at /api/w/:wId/analytics/skills.
const app = workspaceApp();

app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const { days } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const skillsResult = await fetchAvailableSkills(baseQuery);

  if (skillsResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve skills: ${skillsResult.error.message}`,
      },
    });
  }

  const body: GetWorkspaceSkillsResponse = { skills: skillsResult.value };
  return ctx.json(body);
});

export default app;
