import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { fetchTopAgents } from "@app/lib/api/assistant/observability/top_agents";
import type { GetWorkspaceTopAgentsResponse } from "@app/lib/api/workspace/analytics";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(100).optional().default(25),
});

// Mounted at /api/w/:wId/analytics/top-agents.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, limit } = ctx.req.valid("query");

  const result = await fetchTopAgents(auth, { days, limit });

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve top agents: ${result.error.message}`,
      },
    });
  }

  const body: GetWorkspaceTopAgentsResponse = { agents: result.value };
  return ctx.json(body);
});

export default app;
