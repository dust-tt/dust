import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/credits/members-usage.
const app = workspaceApp();

app.get(
  "/",
  validate("query", MembersUsagePaginationSchema),
  async (ctx): HandlerResult<GetMembersUsageResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only workspace admins can access the members usage list.",
        },
      });
    }

    const body = await getMembersUsage({
      auth,
      paginationParams: ctx.req.valid("query"),
    });
    return ctx.json(body);
  }
);

export default app;
