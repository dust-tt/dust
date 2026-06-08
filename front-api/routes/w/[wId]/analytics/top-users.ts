import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetWorkspaceTopUsersResponse } from "@app/lib/api/analytics/workspace_analytics";
import { fetchTopUsers } from "@app/lib/api/assistant/observability/top_users";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(100).optional().default(25),
});

// Mounted at /api/w/:wId/analytics/top-users.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, limit } = ctx.req.valid("query");

  const result = await fetchTopUsers(auth, { days, limit });

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve top users: ${result.error.message}`,
      },
    });
  }

  const body: GetWorkspaceTopUsersResponse = { users: result.value };
  return ctx.json(body);
});

export default app;
