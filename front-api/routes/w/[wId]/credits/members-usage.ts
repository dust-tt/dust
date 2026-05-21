import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/credits/members-usage.
const app = new Hono();

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
      currentUrl: ctx.req.url,
    });
    return ctx.json(body);
  }
);

export default app;
