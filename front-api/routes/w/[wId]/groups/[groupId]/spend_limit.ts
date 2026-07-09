import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  type GroupSpendLimitError,
  MAX_GROUP_SPEND_LIMIT_AWU_CREDITS,
  MIN_GROUP_SPEND_LIMIT_AWU_CREDITS,
  setGroupSpendLimit,
} from "@app/lib/api/groups/spend_limit";
import type { PutGroupSpendLimitResponseBody } from "@app/types/api/groups/spend_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateGroupSpendLimitBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z
      .number()
      .int()
      .min(MIN_GROUP_SPEND_LIMIT_AWU_CREDITS)
      .max(MAX_GROUP_SPEND_LIMIT_AWU_CREDITS),
  }),
]);

const ParamsSchema = z.object({
  groupId: z.string(),
});

function spendLimitErrorToApiError(
  error: GroupSpendLimitError
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
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: { type: "plan_limit_error", message: error.message },
      };
    case "contract_not_found":
      return {
        status_code: 404,
        api_error: { type: "subscription_not_found", message: error.message },
      };
    case "metronome_error":
      return {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: "Failed to update spend limit in billing system.",
        },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/w/:wId/groups/:groupId/spend_limit.
const app = workspaceApp();

/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", UpdateGroupSpendLimitBodySchema),
  async (ctx): HandlerResult<PutGroupSpendLimitResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "Per-group spend limits are only available on Metronome-billed workspaces.",
        },
      });
    }

    const { groupId } = ctx.req.valid("param");

    const result = await setGroupSpendLimit(auth, {
      groupId,
      limit: ctx.req.valid("json"),
      auditContext: getAuditLogContext(auth),
    });
    if (result.isErr()) {
      return apiError(ctx, spendLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
