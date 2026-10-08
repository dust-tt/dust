import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  type SharedUsageLimitError,
  MAX_SHARED_USAGE_LIMIT_AWU_CREDITS,
  MIN_SHARED_USAGE_LIMIT_AWU_CREDITS,
  setGroupSharedUsageLimit,
} from "@app/lib/api/groups/group_shared_usage_limit";
import type { PutSharedUsageLimitResponseBody } from "@app/types/api/groups/shared_usage_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
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

function sharedUsageLimitErrorToApiError(
  error: SharedUsageLimitError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "group_not_found":
      return {
        status_code: 404,
        api_error: { type: "group_not_found", message: error.message },
      };
    case "invalid_group_kind":
    case "invalid_threshold":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: error.message },
      };
    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: error.message },
      };
    case "shared_usage_limits_not_enabled":
      return {
        status_code: 403,
        api_error: { type: "feature_flag_not_found", message: error.message },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/w/:wId/groups/:groupId/shared_usage_limit.
const app = workspaceApp();

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
