import { getSharedUsageLimitOverlaps } from "@app/lib/api/groups/group_shared_usage_limit";
import type { GetSharedUsageLimitOverlapsResponseBody } from "@app/types/api/groups/shared_usage_limit";
import { sharedUsageLimitErrorToApiError } from "@front-api/lib/api/shared_usage_limit_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/shared_usage_limit/overlaps.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  ensureIsManager(),
  async (ctx): HandlerResult<GetSharedUsageLimitOverlapsResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const result = await getSharedUsageLimitOverlaps(auth, { groupId });
    if (result.isErr()) {
      return apiError(ctx, sharedUsageLimitErrorToApiError(result.error));
    }
    return ctx.json({
      groups: result.value.map(({ group, position, sharedMemberCount }) =>
        group.toSharedUsageLimitOverlapJSON({ position, sharedMemberCount })
      ),
    });
  }
);

export default app;
