import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { setGroupSharedUsageLimit } from "@app/lib/api/groups/group_shared_usage_limit";
import type { PutSharedUsageLimitResponseBody } from "@app/types/api/groups/shared_usage_limit";
import {
  MAX_SHARED_USAGE_LIMIT_AWU_CREDITS,
  MIN_SHARED_USAGE_LIMIT_AWU_CREDITS,
} from "@app/types/api/groups/shared_usage_limit";
import { sharedUsageLimitErrorToApiError } from "@front-api/lib/api/shared_usage_limit_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import overlaps from "@front-api/routes/w/[wId]/groups/[groupId]/shared_usage_limit/overlaps";
import { z } from "zod";

const UpdateSharedUsageLimitBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z
      .number()
      .int()
      .min(MIN_SHARED_USAGE_LIMIT_AWU_CREDITS)
      .max(MAX_SHARED_USAGE_LIMIT_AWU_CREDITS),
  }),
]);

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/shared_usage_limit.
const app = workspaceApp();

app.route("/overlaps", overlaps);

/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  validate("json", UpdateSharedUsageLimitBodySchema),
  ensureIsManager(),
  async (ctx): HandlerResult<PutSharedUsageLimitResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const result = await setGroupSharedUsageLimit(auth, {
      groupId,
      limit: ctx.req.valid("json"),
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, sharedUsageLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
