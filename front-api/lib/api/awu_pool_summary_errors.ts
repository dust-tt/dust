import type { AwuPoolSummaryError } from "@app/lib/api/credits/awu_pool_summary";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

export function awuPoolSummaryErrorToApi(
  ctx: Context,
  err: AwuPoolSummaryError
) {
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
