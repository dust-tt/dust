import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetUserCreditsResponse } from "@app/lib/api/assistant/observability/user_credits";
import { fetchUserCreditBreakdown } from "@app/lib/api/assistant/observability/user_credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetUserCreditsResponse };

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(200).optional().default(100),
  search: z.string().optional(),
});

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasPermission("workspace:view_analytics"),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { days, limit, search } = ctx.req.valid("query");

    const result = await fetchUserCreditBreakdown(auth, {
      days,
      limit,
      search,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve user credits: ${result.error.message}`,
        },
      });
    }

    const body: GetUserCreditsResponse = { users: result.value };
    return ctx.json(body);
  }
);

export default app;
