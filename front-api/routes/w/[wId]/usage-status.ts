import { getUpgradeRequestAvailabilityForUser } from "@app/lib/api/credits/upgrade_requests";
import type {
  GetWorkspaceUsageStatusResponseBody,
  ProgrammaticCreditStatus,
} from "@app/lib/metronome/user_block";
import {
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

    const isCreditPriced = plan && isCreditPricedPlan(plan);
    // Workspaces not on Metronome billing have no usage status to report.
    if (!workspace.metronomeCustomerId || !isCreditPriced) {
      return ctx.json({
        userNearCreditLimit: false,
        poolCreditState: "active",
        programmaticCreditStatus: "active",
        balanceThresholdReached: false,
        userBlockedReason: null,
        canRequestUpgrade: false,
        hasPendingUpgradeRequest: false,
      });
    }

    const [
      poolCreditState,
      userBlockedReason,
      programmaticState,
      balanceThresholdReached,
    ] = await Promise.all([
      getWorkspaceCreditPoolStatus(workspace.sId),
      isUserBlocked(workspace, user),
      getWorkspaceProgrammaticCreditStatus(workspace.sId),
      isWorkspaceBalanceThresholdReached(workspace.sId),
    ]);

    const userNearCreditLimit =
      !userBlockedReason && (await isUserAwuWarned(workspace.sId, user.sId));

    let programmaticCreditStatus: ProgrammaticCreditStatus = "active";
    if (programmaticState === "depleted") {
      programmaticCreditStatus = "depleted";
    } else if (
      programmaticState === "active_low_balance" ||
      programmaticState === "active_critical_balance"
    ) {
      programmaticCreditStatus = "warned";
    }

    const { canRequestUpgrade, hasPendingUpgradeRequest } =
      await getUpgradeRequestAvailabilityForUser(auth, {
        isNearOrAtLimit: userNearCreditLimit || userBlockedReason !== null,
      });

    return ctx.json({
      userNearCreditLimit,
      poolCreditState,
      programmaticCreditStatus,
      balanceThresholdReached,
      userBlockedReason,
      canRequestUpgrade,
      hasPendingUpgradeRequest,
    });
  }
);

export default app;
