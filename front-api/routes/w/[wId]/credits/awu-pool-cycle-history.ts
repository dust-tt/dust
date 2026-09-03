import type { AwuPoolSummaryError } from "@app/lib/api/credits/awu_pool_summary";
import {
  AwuPoolSummaryQuerySchema,
  getAwuPoolCycleHistory,
} from "@app/lib/api/credits/awu_pool_summary";
import type { AwuPoolCycleHistoryResponseBody } from "@app/types/api/credits/awu_pool_summary";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";

function cycleHistoryErrorToApi(ctx: Context, err: AwuPoolSummaryError) {
  switch (err.type) {
    case "not_configured":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      });
    case "balances_fetch_failed":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome balances: ${err.cause?.message ?? ""}`,
        },
      });
    case "invoices_fetch_failed":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome invoices: ${err.cause?.message ?? ""}`,
        },
      });
    default:
      assertNever(err.type);
  }
}

// Mounted at /api/w/:wId/credits/awu-pool-cycle-history.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("query", AwuPoolSummaryQuerySchema),
  async (ctx): HandlerResult<AwuPoolCycleHistoryResponseBody> => {
    const auth = ctx.get("auth");
    const { cycleHistoryLimit } = ctx.req.valid("query");

    const result = await getAwuPoolCycleHistory(auth, { cycleHistoryLimit });
    if (result.isErr()) {
      return cycleHistoryErrorToApi(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

export default app;
