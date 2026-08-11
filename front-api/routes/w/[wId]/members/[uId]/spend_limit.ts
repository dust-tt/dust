import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  getUserSpendLimit,
  setUserSpendLimit,
} from "@app/lib/api/users/spend_limit";
import type {
  GetUserSpendLimitResponseBody,
  PutUserSpendLimitResponseBody,
} from "@app/types/api/users/spend_limit";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  spendLimitErrorToApiError,
  UpdateUserSpendLimitBodySchema,
} from "@front-api/routes/w/[wId]/user_spend_limit_shared";
import { z } from "zod";

const ParamsSchema = z.object({
  uId: z.string(),
});

// Mounted at /api/w/:wId/members/:uId/spend_limit.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  ensureIsManager(),
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
  ensureIsManager(),
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

    const { uId } = ctx.req.valid("param");

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
