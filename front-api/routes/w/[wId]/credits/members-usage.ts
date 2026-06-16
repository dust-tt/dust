import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/credits/members-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  validate("query", MembersUsagePaginationSchema),
  async (ctx): HandlerResult<GetMembersUsageResponseBody> => {
    const auth = ctx.get("auth");

    const body = await getMembersUsage({
      auth,
      paginationParams: ctx.req.valid("query"),
    });
    return ctx.json(body);
  }
);

export default app;
