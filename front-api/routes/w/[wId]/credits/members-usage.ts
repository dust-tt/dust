import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import { listGroupsWithVerb } from "@app/lib/resources/group_management_access";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/credits/members-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", MembersUsagePaginationSchema),
  async (ctx): HandlerResult<GetMembersUsageResponseBody> => {
    const auth = ctx.get("auth");
    if (
      !auth.isManager() &&
      (!(await auth.hasFeatureFlag("group_management")) ||
        (await listGroupsWithVerb(auth, "read_usage")).length === 0)
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only workspace managers and group managers can view member usage.",
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
