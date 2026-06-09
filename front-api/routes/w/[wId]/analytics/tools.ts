import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetWorkspaceToolsResponse } from "@app/lib/api/assistant/observability/tool_usage";
import {
  fetchAvailableTools,
  resolveToolDisplayNames,
} from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/tools.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const toolsResult = await fetchAvailableTools(baseQuery);

  if (toolsResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve tools: ${toolsResult.error.message}`,
      },
    });
  }

  const tools = await resolveToolDisplayNames(auth, toolsResult.value);

  const body: GetWorkspaceToolsResponse = { tools };
  return ctx.json(body);
});

export default app;
