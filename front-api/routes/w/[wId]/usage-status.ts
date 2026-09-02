import {
  isUserAwuWarned,
  isUserBlocked,
  isWorkspaceProgrammaticWarningReached,
} from "@app/lib/api/credits/access_control";
import { getUpgradeRequestAvailabilityForUser } from "@app/lib/api/credits/upgrade_requests";
import { isNonCreditPricedUserSpendLimitReached } from "@app/lib/api/users/spend_limit";
import { getFeatureFlags } from "@app/lib/auth";
import type {
  GetWorkspaceUsageStatusResponseBody,
  ProgrammaticCreditStatus,
} from "@app/lib/metronome/user_block";
import {
  getWorkspaceCreditPoolStatus,
  getWorkspaceProgrammaticCreditStatus,
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
    // Workspaces not on Metronome billing have no usage status to report,
    // unless we've overriden their default per-user credit limit.
    if (!workspace.metronomeCustomerId || !isCreditPriced) {
      const featureFlags = await getFeatureFlags(auth);
      const isLimitReached =
        featureFlags.includes("enforce_user_spend_limit_rate_cap") &&
        (await isNonCreditPricedUserSpendLimitReached(auth, { user }));

      return ctx.json({
        userNearCreditLimit: false,
        poolCreditState: "active",
        programmaticCreditStatus: "active",
        programmaticWarningReached: false,
        balanceThresholdReached: false,
        userBlockedReason: isLimitReached ? "user_cap_reached" : null,
        canRequestUpgrade: false,
        hasPendingUpgradeRequest: false,
        willAutoUpgrade: false,
        requireReason: false,
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
      isUserBlocked(auth, user),
      getWorkspaceProgrammaticCreditStatus(workspace.sId),
      isWorkspaceProgrammaticWarningReached(auth),
      isWorkspaceBalanceThresholdReached(workspace.sId),
    ]);

    // `isUserAwuWarned` is flag-aware: the Redis rate-limiter warning (80% of
    // the effective cap) when the flag is on, the Metronome near-limit flag
    // otherwise.
    const userNearCreditLimit =
      !userBlockedReason && (await isUserAwuWarned(auth, { user }));

    const programmaticCreditStatus: ProgrammaticCreditStatus =
      programmaticState === "depleted" ? "depleted" : "active";

    const {
      canRequestUpgrade,
      hasPendingUpgradeRequest,
      willAutoUpgrade,
      requireReason,
    } = await getUpgradeRequestAvailabilityForUser(auth, {
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
      willAutoUpgrade,
      requireReason,
    });
  }
);

export default app;
