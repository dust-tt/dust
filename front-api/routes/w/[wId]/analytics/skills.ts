import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { AvailableSkill } from "@app/lib/api/assistant/observability/skill_usage";
import { fetchAvailableSkills } from "@app/lib/api/assistant/observability/skill_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";

import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type GetWorkspaceSkillsResponse = {
  skills: AvailableSkill[];
};

// Mounted at /api/w/:wId/analytics/skills.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message: "Only workspace admins can access workspace analytics.",
        },
      },
      403
    );
  }

  const { days } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const skillsResult = await fetchAvailableSkills(baseQuery);

  if (skillsResult.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve skills: ${skillsResult.error.message}`,
        },
      },
      500
    );
  }

  const body: GetWorkspaceSkillsResponse = { skills: skillsResult.value };
  return c.json(body);
});

export default app;
