import type { MetronomeBalancesError } from "@app/lib/api/credits/metronome_balances";
import { getMetronomeBalances } from "@app/lib/api/credits/metronome_balances";
import type { GetCreditsResponseBody } from "@app/types/credits";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

function balancesErrorToApi(ctx: Context, err: MetronomeBalancesError) {
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

// Mounted at /api/w/:wId/credits/metronome-balances.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetCreditsResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  const result = await getMetronomeBalances(auth);
  if (result.isErr()) {
    return balancesErrorToApi(ctx, result.error);
  }
  return ctx.json(result.value);
});

export default app;
