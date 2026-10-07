import {
  MAX_SHARED_USAGE_LIMIT_AWU_CREDITS,
  MIN_SHARED_USAGE_LIMIT_AWU_CREDITS,
  previewGroupSharedUsageLimit,
} from "@app/lib/api/groups/group_shared_usage_limit";
import type { GetSharedUsageLimitPreviewResponseBody } from "@app/types/api/groups/shared_usage_limit";
import { sharedUsageLimitErrorToApiError } from "@front-api/lib/api/shared_usage_limit_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PreviewSharedUsageLimitQuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z.coerce
      .number()
      .int()
      .min(MIN_SHARED_USAGE_LIMIT_AWU_CREDITS)
      .max(MAX_SHARED_USAGE_LIMIT_AWU_CREDITS),
  }),
]);

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/shared_usage_limit/preview.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", PreviewSharedUsageLimitQuerySchema),
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSharedUsageLimitPreviewResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const result = await previewGroupSharedUsageLimit(auth, {
      groupId,
      limit: ctx.req.valid("query"),
    });
    if (result.isErr()) {
      return apiError(ctx, sharedUsageLimitErrorToApiError(result.error));
    }
    const preview = result.value;
    return ctx.json({
      usedAwuCredits: preview.usedAwuCredits,
      blocksDrawingMembers: preview.blocksDrawingMembers,
      membersDrawingElsewhere: preview.membersDrawingElsewhere.map(
        ({ user, group }) => ({ user: user.toJSON(), group: group.toJSON() })
      ),
      membersDrawingElsewhereCount: preview.membersDrawingElsewhereCount,
    });
  }
);

export default app;
