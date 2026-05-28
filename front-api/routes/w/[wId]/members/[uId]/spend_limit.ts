import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  type GetUserSpendLimitResponse,
  getUserSpendLimit,
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
  type SetUserSpendLimitResponse,
  setUserSpendLimit,
  type UserSpendLimitError,
} from "@app/lib/api/users/spend_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
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
  }),
]);

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

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
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
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

app.get(
  "/",
  ensureIsAdmin(),
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

    const uId = ctx.req.param("uId") ?? "";
    if (!uId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid query parameters, `uId` (string) is required.",
        },
      });
    }

    const result = await getUserSpendLimit(auth, { userId: uId });
    if (result.isErr()) {
      return apiError(ctx, spendLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

app.put(
  "/",
  ensureIsAdmin(),
  validate("json", UpdateUserSpendLimitBodySchema),
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

    const uId = ctx.req.param("uId") ?? "";
    if (!uId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid query parameters, `uId` (string) is required.",
        },
      });
    }

    const auditContext = getAuditLogContext(auth);
    const result = await setUserSpendLimit(auth, {
      userId: uId,
      limit: ctx.req.valid("json"),
      auditContext,
    });
    if (result.isErr()) {
      return apiError(ctx, spendLimitErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
