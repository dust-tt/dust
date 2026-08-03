import {
  activateCreditPricedFreePlan,
  isMetronomeBillingEnabled,
} from "@app/lib/api/subscription";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import type { Logger } from "@app/logger/logger";

import { makeScript } from "./helpers";

// Repairs workspaces whose /trial/start failed with
// `subscription_cancellation_scheduled` (regression introduced by #29521,
// since reverted). Those workspaces are stuck on FREE_NO_PLAN with a
// Metronome customer already provisioned but no seat, contract or
// subscription row. Re-running `activateCreditPricedFreePlan` is safe: the
// Metronome customer creation is idempotent and the contract provisioning is
// deduplicated by its uniqueness key.
//
// The original geo-IP country code is lost, so the currency defaults to USD
// unless --countryCode is provided (applies to all listed workspaces).
async function repairWorkspace(
  workspaceId: string,
  countryCode: string | undefined,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const adminAuth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = adminAuth.getNonNullableWorkspace();

  // Invariant: the workspace must still be on FREE_NO_PLAN, i.e. have no
  // subscription row at all. This excludes workspaces that already retried
  // successfully after the revert or switch to paid plan.
  const subscriptions =
    await SubscriptionResource.fetchByAuthenticator(adminAuth);
  if (subscriptions.length > 0) {
    logger.info(
      {
        workspaceId,
        planCodes: subscriptions.map((s) => s.getPlan().code),
      },
      "Skipping: workspace already has subscription rows"
    );
    return;
  }

  // Sanity checks: a failed trial start implies a verified phone and a
  // Metronome customer (step 1 of the provisioning succeeded).
  const hasVerifiedPhone =
    await WorkspaceVerificationAttemptResource.hasVerifiedPhone(adminAuth);
  if (!hasVerifiedPhone) {
    logger.warn(
      { workspaceId },
      "Skipping: workspace has no verified phone, trial start was never attempted"
    );
    return;
  }
  if (!workspace.metronomeCustomerId) {
    logger.warn(
      { workspaceId },
      "Workspace has no Metronome customer, trial start may not have been attempted (proceeding anyway)"
    );
  }
  if (!(await isMetronomeBillingEnabled(adminAuth))) {
    logger.warn(
      { workspaceId },
      "Skipping: Metronome billing is disabled for this workspace"
    );
    return;
  }

  // The failed run assigned no seat, so the free seat goes to the workspace
  // admin (the creator on these fresh workspaces). If several admins exist,
  // pick the earliest member.
  const { members } = await getMembers(adminAuth, {
    roles: ["admin"],
    activeOnly: true,
  });
  if (members.length === 0) {
    logger.warn({ workspaceId }, "Skipping: workspace has no active admin");
    return;
  }
  const [admin] = [...members].sort((a, b) => a.createdAt - b.createdAt);
  if (members.length > 1) {
    logger.warn(
      { workspaceId, adminCount: members.length, pickedAdmin: admin.sId },
      "Multiple admins found, picking the earliest one"
    );
  }

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
      adminId: admin.sId,
      adminEmail: admin.email,
      countryCode: countryCode ?? null,
    },
    `${execute ? "" : "[DRYRUN] "}Activating credit-priced free plan`
  );

  if (!execute) {
    return;
  }

  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    admin.sId,
    workspaceId
  );
  await activateCreditPricedFreePlan(userAuth, countryCode);

  logger.info({ workspaceId }, "Credit-priced free plan activated");
}

makeScript(
  {
    wIds: {
      type: "array",
      demandOption: true,
      describe: "Workspace sIds of the workspaces to repair",
    },
    countryCode: {
      type: "string",
      describe:
        "Country code used to pick the billing currency (defaults to US/USD)",
    },
  },
  async ({ wIds, countryCode, execute }, logger) => {
    for (const wId of wIds) {
      try {
        await repairWorkspace(wId, countryCode, execute, logger);
      } catch (err) {
        logger.error({ workspaceId: wId, err }, "Failed to repair workspace");
      }
    }
  }
);
