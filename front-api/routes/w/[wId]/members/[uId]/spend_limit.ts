import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  getUserSpendLimit,
  setUserSpendLimit,
  type UserSpendLimitError,
} from "@app/lib/api/users/spend_limit";
import {
  type GetUserSpendLimitResponseBody,
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
  type PutUserSpendLimitResponseBody,
} from "@app/types/api/users/spend_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasAnyGroupPermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateUserSpendLimitBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z
      .number()
      .int()
      .min(MIN_USER_SPEND_LIMIT_AWU_CREDITS)
      .max(MAX_USER_SPEND_LIMIT_AWU_CREDITS),
    resetAtNextBillingCycle: z.boolean().optional(),
  }),
]);

const ParamsSchema = z.object({
  uId: z.string(),
});

function spendLimitErrorToApiError(
  error: UserSpendLimitError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "user_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: error.message,
        },
      };
    case "unauthorized":
      return {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: error.message,
        },
      };
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message: error.message,
        },
      };
    case "billing_period_unavailable":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
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

// Mounted at /api/w/:wId/members/:uId/spend_limit.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  ensureHasAnyGroupPermission(
    "read_usage",
    "Only workspace managers and group managers can view member limits."
  ),
  async (ctx): HandlerResult<GetUserSpendLimitResponseBody> => {
    const auth = ctx.get("auth");
    if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "Per-user spend limits are only available on Metronome-billed workspaces.",
        },
      });
    }

    const { uId } = ctx.req.valid("param");

    const result = await getUserSpendLimit(auth, { userId: uId });
    if (result.isErr()) {
      return apiError(ctx, spendLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

app.put(
  "/",
  validate("param", ParamsSchema),
  validate("json", UpdateUserSpendLimitBodySchema),
  ensureHasAnyGroupPermission(
    "set_usage_limits",
    "Only workspace managers and group managers can change member limits."
  ),
  async (ctx): HandlerResult<PutUserSpendLimitResponseBody> => {
    const auth = ctx.get("auth");
    if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "Per-user spend limits are only available on Metronome-billed workspaces.",
        },
      });
    }

    const { uId } = ctx.req.valid("param");

    const auditContext = getAuditLogContext(auth);
    const body = ctx.req.valid("json");
    const result = await setUserSpendLimit(auth, {
      userId: uId,
      limit:
        body.kind === "unlimited"
          ? { kind: "unlimited" }
          : { kind: "limited", awuCredits: body.awuCredits },
      resetAtNextBillingCycle:
        body.kind === "limited"
          ? (body.resetAtNextBillingCycle ?? false)
          : false,
      auditContext,
    });
    if (result.isErr()) {
      return apiError(ctx, spendLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
