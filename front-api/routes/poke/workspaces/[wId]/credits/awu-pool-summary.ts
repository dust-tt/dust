import type { AwuPoolSummaryResponseBody } from "@app/lib/api/credits/awu_pool_summary";
import { getAwuPoolSummary } from "@app/lib/api/credits/awu_pool_summary";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

export type { AwuPoolSummaryResponseBody };

// Mounted at /api/poke/workspaces/:wId/credits/awu-pool-summary.
const app = pokeApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const result = await getAwuPoolSummary(auth);
  if (result.isErr()) {
    const err = result.error;
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

  return ctx.json(result.value);
});

export default app;
