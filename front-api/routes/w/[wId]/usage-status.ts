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
  isWorkspaceProgrammaticWarningReached,
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
        programmaticWarningReached: false,
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
      programmaticWarningReached,
      balanceThresholdReached,
    ] = await Promise.all([
      getWorkspaceCreditPoolStatus(workspace.sId),
      isUserBlocked(workspace, user),
      getWorkspaceProgrammaticCreditStatus(workspace.sId),
      isWorkspaceProgrammaticWarningReached(workspace.sId),
      isWorkspaceBalanceThresholdReached(workspace.sId),
    ]);

    const userNearCreditLimit =
      !userBlockedReason && (await isUserAwuWarned(workspace.sId, user.sId));

    const programmaticCreditStatus: ProgrammaticCreditStatus =
      programmaticState === "depleted" ? "depleted" : "active";

    const { canRequestUpgrade, hasPendingUpgradeRequest } =
      await getUpgradeRequestAvailabilityForUser(auth, {
        isNearOrAtLimit: userNearCreditLimit || userBlockedReason !== null,
      });

    return ctx.json({
      userNearCreditLimit,
      poolCreditState,
      programmaticCreditStatus,
      programmaticWarningReached,
      balanceThresholdReached,
      userBlockedReason,
      canRequestUpgrade,
      hasPendingUpgradeRequest,
    });
  }
);

export default app;
