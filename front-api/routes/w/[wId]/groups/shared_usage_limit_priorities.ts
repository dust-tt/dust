import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { setSharedUsageLimitOrder } from "@app/lib/api/groups/group_shared_usage_limit";
import type { PutSharedUsageLimitPrioritiesResponseBody } from "@app/types/api/groups/shared_usage_limit";
import { sharedUsageLimitErrorToApiError } from "@front-api/lib/api/shared_usage_limit_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PutSharedUsageLimitPrioritiesBodySchema = z.object({
  orderedGroupIds: z.array(z.string()).min(1),
  expectedOrderedGroupIds: z.array(z.string()).min(1),
});

// Mounted at /api/w/:wId/groups/shared_usage_limit_priorities.
const app = workspaceApp();

/** @ignoreswagger */
app.put(
  "/",
  validate("json", PutSharedUsageLimitPrioritiesBodySchema),
  ensureIsManager(),
  async (ctx): HandlerResult<PutSharedUsageLimitPrioritiesResponseBody> => {
    const auth = ctx.get("auth");
    const { orderedGroupIds, expectedOrderedGroupIds } = ctx.req.valid("json");

    const result = await setSharedUsageLimitOrder(auth, {
      orderedGroupIds,
      expectedOrderedGroupIds,
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, sharedUsageLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
