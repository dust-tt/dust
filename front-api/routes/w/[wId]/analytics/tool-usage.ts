import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { ToolUsagePoint } from "@app/lib/api/assistant/observability/tool_usage";
import { fetchToolUsageMetrics } from "@app/lib/api/assistant/observability/tool_usage";
import {
  buildAgentAnalyticsBaseQuery,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";

import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  serverName: z.string().optional(),
  timezone: timezoneSchema,
});

export type GetWorkspaceToolUsageResponse = {
  points: ToolUsagePoint[];
};

// Mounted at /api/w/:wId/analytics/tool-usage.
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

  const { days, serverName, timezone } = c.req.valid("query");
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve tool usage metrics: ${usageResult.error.message}`,
        },
      },
      500
    );
  }

  const body: GetWorkspaceToolUsageResponse = { points: usageResult.value };
  return c.json(body);
});

export default app;
