import {
  getWorkspaceBalanceThreshold,
  syncMetronomeBalanceThresholdAlert,
} from "@app/lib/api/credits/balance_threshold_alert";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type CreditUsageConfigurationBody = {
  // Credit balance (in AWU credits) below which workspace admins are emailed.
  // `null` means no threshold is configured (the warning is off). Derived from
  // the workspace's Metronome balance-threshold alert, not the database.
  balanceThresholdCredits: number | null;
};

export type GetCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export type PatchCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export const PatchCreditUsageConfigurationRequestBody = z.object({
  // 0 (or null) clears the threshold; a positive value enables the alert.
  balanceThresholdCredits: z.number().int().min(0).nullable(),
});

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
