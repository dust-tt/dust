import apiConfig from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { floorToHourISO } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { FREE_PACKAGE_ALIAS } from "@app/lib/metronome/types";
import { PlanModel } from "@app/lib/models/plan";
import { CREDIT_PRICED_FREE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { terminateScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { removeNulls } from "@app/types/shared/utils/general";

// Metronome billing is enabled by default for all workspaces. The
// `global_disable_metronome_billing` kill switch turns it off globally; the
// `metronome_billing` feature flag re-enables it for individual workspaces.
export async function isMetronomeBillingEnabled(
  auth: Authenticator
): Promise<boolean> {
  const [hasFlag, killed] = await Promise.all([
    hasFeatureFlag(auth, "metronome_billing"),
    KillSwitchResource.isKillSwitchEnabled("global_disable_metronome_billing"),
  ]);
  return hasFlag || !killed;
}

/**
 * Restores a workspace to full functionality after subscription activation/reactivation.
 * This function is called when:
 * - A new subscription is created (Stripe checkout or manual upgrade)
 * - A subscription is reactivated after cancellation
 *
 * It performs the following actions:
 * - Terminates the scheduled workspace scrub workflow (if any)
 * - Unpauses all connectors (including webcrawler connectors)
 * - Re-enables all triggers that point to non-archived agents
 */
export async function activateCreditPricedFreePlan(
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const lightWorkspace = renderLightWorkspaceType({ workspace: owner });
  const now = new Date(floorToHourISO(new Date()));

  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: lightWorkspace,
  });
  if (customerResult.isErr()) {
    throw new Error(
      `Failed to ensure Metronome customer: ${customerResult.error.message}`
    );
  }
  const { metronomeCustomerId } = customerResult.value;

  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    packageAlias: FREE_PACKAGE_ALIAS,
    uniquenessKey: `cp-free-plan-${owner.sId}`,
    startingAt: now,
    swapAt: "current-hour",
    enableStripeBilling: false,
    planCode: CREDIT_PRICED_FREE_PLAN_CODE,
  });
  if (contractResult.isErr()) {
    throw new Error(
      `Failed to provision Metronome contract: ${contractResult.error.message}`
    );
  }
  const { metronomeContractId } = contractResult.value;

  const plan = await PlanModel.findOne({
    where: { code: CREDIT_PRICED_FREE_PLAN_CODE },
  });
  if (!plan) {
    throw new Error(
      `Plan row for ${CREDIT_PRICED_FREE_PLAN_CODE} not found in DB. ` +
        `Seed it in production before enabling Metronome billing.`
    );
  }

  const subscriptionResult =
    await SubscriptionResource.createSubscriptionFromCheckout({
      workspaceModelId: owner.id,
      plan,
      metronomeContractId,
      now,
    });
  if (subscriptionResult.isErr()) {
    throw new Error(
      `Failed to create subscription: ${subscriptionResult.error.message}`
    );
  }

  await restoreWorkspaceAfterSubscription(auth);
}

export async function restoreWorkspaceAfterSubscription(auth: Authenticator) {
  const owner = auth.getNonNullableWorkspace();

  const scrubCancelRes = await terminateScheduleWorkspaceScrubWorkflow({
    workspaceId: owner.sId,
    stopReason: "Workspace subscription activated/reactivated",
  });
  if (scrubCancelRes.isErr()) {
    logger.error(
      { stripeError: true, error: scrubCancelRes.error },
      "Error terminating scrub workspace workflow."
    );
  }

  const dataSources = await getDataSources(auth);
  const connectorIds = removeNulls(dataSources.map((ds) => ds.connectorId));

  const connectorsAPI = new ConnectorsAPI(
    apiConfig.getConnectorsAPIConfig(),
    logger
  );

  for (const connectorId of connectorIds) {
    const r = await connectorsAPI.unpauseConnector(connectorId);
    if (r.isErr() && r.error.message !== "Connector is not stopped") {
      logger.error(
        {
          connectorId,
          stripeError: true,
          error: r.error,
          workspaceId: owner.sId,
        },
        "Error unpausing connector after subscription reactivation."
      );
    }
  }

  // Re-enable all triggers that were disabled due to downgrade and point to non-archived agents.
  const enableTriggersRes = await TriggerResource.enableAllForWorkspace(
    auth,
    "downgraded"
  );
  if (enableTriggersRes.isErr()) {
    logger.error(
      {
        stripeError: true,
        error: enableTriggersRes.error,
        workspaceId: owner.sId,
      },
      "Error re-enabling workspace triggers on subscription reactivation"
    );
    // Don't throw an error here, we want the function to continue even if trigger re-enabling fails.
  }
}
