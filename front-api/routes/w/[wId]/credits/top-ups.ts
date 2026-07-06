import type { AwuTopUpsHistoryError } from "@app/lib/api/credits/top_ups_history";
import { getAwuTopUpsHistory } from "@app/lib/api/credits/top_ups_history";
import type { GetAwuTopUpsHistoryResponseBody } from "@app/types/api/credits/top_ups_history";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBusinessAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

function topUpsErrorToApi(ctx: Context, err: AwuTopUpsHistoryError) {
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
    default:
      assertNever(err.type);
  }
}

// Mounted at /api/w/:wId/credits/top-ups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsBusinessAdmin(),
  async (ctx): HandlerResult<GetAwuTopUpsHistoryResponseBody> => {
    const auth = ctx.get("auth");

    const result = await getAwuTopUpsHistory(auth);
    if (result.isErr()) {
      return topUpsErrorToApi(ctx, result.error);
    }
    return ctx.json(result.value);
  }
);

export default app;
