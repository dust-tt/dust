import type {
  GetWorkspaceUsageStatusResponseBody,
  ProgrammaticCreditStatus,
} from "@app/lib/metronome/user_block";
import {
  getFairUseAwuCreditsStatus,
  getWorkspaceCreditPoolStatus,
  getWorkspaceProgrammaticCreditStatus,
  isUserAwuWarned,
  isUserBlocked,
  isWorkspaceBalanceThresholdReached,
} from "@app/lib/metronome/user_block";
import { isCreditPricedPlan } from "@app/types/plan";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/usage-status.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceUsageStatusResponseBody> => {
    const auth = ctx.get("auth");
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const plan = auth.plan();

    const fairUseAwuCreditsState = await getFairUseAwuCreditsStatus({
      workspace,
      user: user.toJSON(),
      plan: auth.plan(),
    });

    const isCreditPriced = plan && isCreditPricedPlan(plan);
    // Workspaces not on Metronome billing have no usage status to report.
    if (!workspace.metronomeCustomerId || !isCreditPriced) {
      return ctx.json({
        awuStatus: "normal",
        fairUseAwuCreditsState,
        poolCreditState: "active",
        programmaticCreditStatus: "active",
        balanceThresholdReached: false,
      });
    }

    const [
      poolCreditState,
      blockedReason,
      programmaticState,
      balanceThresholdReached,
    ] = await Promise.all([
      getWorkspaceCreditPoolStatus(workspace.sId),
      isUserBlocked(workspace.sId, user.sId),
      getWorkspaceProgrammaticCreditStatus(workspace.sId),
      isWorkspaceBalanceThresholdReached(workspace.sId),
    ]);

    let awuStatus: GetWorkspaceUsageStatusResponseBody["awuStatus"] = "normal";
    if (blockedReason === "user_cap_reached") {
      awuStatus = "blocked";
    } else if (await isUserAwuWarned(workspace.sId, user.sId)) {
      awuStatus = "warned";
    }

    let programmaticCreditStatus: ProgrammaticCreditStatus = "active";
    if (programmaticState === "depleted") {
      programmaticCreditStatus = "depleted";
    } else if (
      programmaticState === "active_low_balance" ||
      programmaticState === "active_critical_balance"
    ) {
      programmaticCreditStatus = "warned";
    }

    return ctx.json({
      awuStatus,
      fairUseAwuCreditsState,
      poolCreditState,
      programmaticCreditStatus,
      balanceThresholdReached,
    });
  }
);

export default app;
