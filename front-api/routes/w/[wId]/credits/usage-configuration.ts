import type {
  GetCreditUsageConfigurationResponseBody,
  PatchCreditUsageConfigurationResponseBody,
} from "@app/lib/api/credits/balance_threshold_alert";
import {
  getWorkspaceBalanceThreshold,
  PatchCreditUsageConfigurationRequestBody,
  syncMetronomeBalanceThresholdAlert,
} from "@app/lib/api/credits/balance_threshold_alert";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/credits/usage-configuration.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetCreditUsageConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const balanceThresholdCredits = await getWorkspaceBalanceThreshold(auth);

    return ctx.json({
      configuration: { balanceThresholdCredits },
    });
  }
);

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchCreditUsageConfigurationRequestBody),
  async (ctx): HandlerResult<PatchCreditUsageConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const { balanceThresholdCredits } = ctx.req.valid("json");
    // Normalize 0 to null — both mean "no threshold / warning off".
    const threshold =
      balanceThresholdCredits && balanceThresholdCredits > 0
        ? balanceThresholdCredits
        : null;

    const syncResult = await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: threshold,
    });
    if (syncResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: syncResult.error.message,
        },
      });
    }

    return ctx.json({
      configuration: { balanceThresholdCredits: threshold },
    });
  }
);

export default app;
