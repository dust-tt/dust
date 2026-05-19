import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { AvailableTool } from "@app/lib/api/assistant/observability/tool_usage";
import {
  fetchAvailableTools,
  resolveToolDisplayNames,
} from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";

import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type GetWorkspaceToolsResponse = {
  tools: AvailableTool[];
};

// Mounted at /api/w/:wId/analytics/tools.
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

  const toolsResult = await fetchAvailableTools(baseQuery);

  if (toolsResult.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve tools: ${toolsResult.error.message}`,
        },
      },
      500
    );
  }

  const tools = await resolveToolDisplayNames(auth, toolsResult.value);

  const body: GetWorkspaceToolsResponse = { tools };
  return c.json(body);
});

export default app;
