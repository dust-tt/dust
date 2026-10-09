import { getGroupSharedUsageLimits } from "@app/lib/api/groups/group_shared_usage_limit";
import type { GetGroupsUsageResponseBody } from "@app/types/api/groups/shared_usage_limit";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasAnyGroupPermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/groups-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasAnyGroupPermission(
    "read_usage",
    "Only workspace managers and group managers can view group usage."
  ),
  async (ctx): HandlerResult<GetGroupsUsageResponseBody> => {
    const auth = ctx.get("auth");

    const usage = await getGroupSharedUsageLimits(auth);
    if (usage === null) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: "Shared usage limits are not available for this workspace.",
        },
      });
    }
    return ctx.json({
      groups: usage.map(({ group, usedAwuCredits, usageTarget }) =>
        group.toSharedUsageLimitJSON({ usedAwuCredits, usageTarget })
      ),
    });
  }
);

export default app;
