/** @ignoreswagger */

import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  type DefaultUserSpendLimit,
  type DefaultUserSpendLimitError,
  getDefaultUserSpendLimit,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { getPlanDefaultPoolLimitAwuCredits } from "@app/lib/plans/plan_codes";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateDefaultUserSpendLimitBodySchema = z.object({
  awuCredits: z
    .number()
    .int()
    .min(MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS)
    .max(MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS),
});

export type GetDefaultUserSpendLimitResponseBody = {
  awuCredits: number | null;
};

export type PutDefaultUserSpendLimitResponseBody = DefaultUserSpendLimit;

function mapErrorToApiError(
  error: DefaultUserSpendLimitError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "workspace_not_metronome_billed":
      return {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message: error.message,
        },
      };
    case "not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: error.message,
        },
      };
    case "invalid_threshold":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      };
    case "contract_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: error.message,
        },
      };
    case "metronome_error":
      return {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message:
            "Failed to read or update the default spend limit in billing system.",
        },
      };
    default:
      assertNever(error.type);
  }
}

// Mounted at /api/w/:wId/usage_settings/default_user_spend_limit.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetDefaultUserSpendLimitResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "The default user spend limit is only available on Metronome-billed workspaces.",
        },
      });
    }

    const result = await getDefaultUserSpendLimit(auth);
    if (result.isErr()) {
      if (result.error.type === "not_found") {
        const planCode = auth
          .getNonNullableSubscriptionResource()
          .getPlan().code;
        return ctx.json({
          awuCredits: getPlanDefaultPoolLimitAwuCredits(planCode),
        });
      }
      return apiError(ctx, mapErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

app.put(
  "/",
  ensureIsAdmin(),
  validate("json", UpdateDefaultUserSpendLimitBodySchema),
  async (ctx): HandlerResult<PutDefaultUserSpendLimitResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "The default user spend limit is only available on Metronome-billed workspaces.",
        },
      });
    }

    const { awuCredits } = ctx.req.valid("json");

    const auditContext = getAuditLogContext(auth);
    const result = await setDefaultUserSpendLimit(auth, {
      awuCredits,
      auditContext,
    });
    if (result.isErr()) {
      return apiError(ctx, mapErrorToApiError(result.error));
    }
    return ctx.json(result.value);
  }
);

export default app;
