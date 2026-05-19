import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { SkillUsagePoint } from "@app/lib/api/assistant/observability/skill_usage";
import { fetchSkillUsageMetrics } from "@app/lib/api/assistant/observability/skill_usage";
import {
  buildAgentAnalyticsBaseQuery,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";

import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  skillName: z.string().optional(),
  timezone: timezoneSchema,
});

export type GetWorkspaceSkillUsageResponse = {
  points: SkillUsagePoint[];
};

// Mounted at /api/w/:wId/analytics/skill-usage.
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

  const { days, skillName, timezone } = c.req.valid("query");
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve skill usage metrics: ${usageResult.error.message}`,
        },
      },
      500
    );
  }

  const body: GetWorkspaceSkillUsageResponse = { points: usageResult.value };
  return c.json(body);
});

export default app;
