import apiConfig from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { SUBSCRIPTION_SWAP_HANDLED_INLINE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { BUSINESS_USD_PACKAGE_ALIAS } from "@app/lib/metronome/types";
import { PlanModel } from "@app/lib/models/plan";
import {
  getBillingCurrencyForCountry,
  resolvePackageAliasForCurrency,
} from "@app/lib/plans/billing_currency";
import { CREDIT_PRICED_FREE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { terminateScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { removeNulls } from "@app/types/shared/utils/general";

// Metronome billing is enabled by default for all workspaces. The
// `legacy_billing` feature flag forces it off for individual workspaces.
export async function isMetronomeBillingEnabled(
  auth: Authenticator
): Promise<boolean> {
  return !(await hasFeatureFlag(auth, "legacy_billing"));
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
async function provisionCreditPricedFreePlan(
  auth: Authenticator,
  { user, countryCode }: { user?: UserResource; countryCode?: string }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const lightWorkspace = renderLightWorkspaceType({ workspace: owner });
  const now = new Date();

  const currency = getBillingCurrencyForCountry(countryCode ?? "US", true);
  const packageAlias = resolvePackageAliasForCurrency(
    BUSINESS_USD_PACKAGE_ALIAS,
    currency
  );

  logger.info(
    { workspaceId: owner.sId, countryCode, currency, packageAlias },
    "Activating credit-priced free plan"
  );

  const plan = await PlanModel.findOne({
    where: { code: CREDIT_PRICED_FREE_PLAN_CODE },
  });
  if (!plan) {
    throw new Error(
      `Plan row for ${CREDIT_PRICED_FREE_PLAN_CODE} not found in DB. ` +
        `Seed it in production before enabling Metronome billing.`
    );
  }

  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: lightWorkspace,
  });
  if (customerResult.isErr()) {
    throw new Error(
      `Failed to ensure Metronome customer: ${customerResult.error.message}`
    );
  }
  const { metronomeCustomerId } = customerResult.value;

  if (user) {
    const seatResult = await updateMembershipSeatAndTrack({
      user,
      workspace: lightWorkspace,
      newSeatType: "free",
      author: "no-author",
    });
    if (seatResult.isErr()) {
      throw new Error(
        `Failed to update user to free seat: ${seatResult.error.type}`
      );
    }
  }

  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    // For Free plan, we directly use the Business package (USD or EUR based on
    // geo IP) so the workspace has access to all seats in the contract for upgrades.
    packageAlias,
    uniquenessKey: `cp-business-for-free-plan-${owner.sId}}`,
    startingAt: now,
    swapAt: "current-hour",
    enableStripeBilling: false,
    planCode: CREDIT_PRICED_FREE_PLAN_CODE,
    displayedName: `Free Business ${currency.toUpperCase()}`,
    // Skip the inline seat sync: it reads rate-limited Metronome seat endpoints
    // (`getSubscriptionSeatsHistory`, `seatBalances/list`) and a transient 429
    // there would abort signup after the contract was already created. Seats are
    // reconciled out-of-band via the immediate seat-sync workflow launched below.
    enableSeatSync: false,
    // We create the subscription row ourselves right below via
    // `createSubscriptionFromCheckout`. Stamp the contract so the
    // contract.start webhook skips its own subscription swap instead of
    // racing with this synchronous write (see the custom field's doc comment).
    additionalCustomFields: {
      [SUBSCRIPTION_SWAP_HANDLED_INLINE_CUSTOM_FIELD_KEY]: "true",
    },
  });
  if (contractResult.isErr()) {
    throw new Error(
      `Failed to provision Metronome contract: ${contractResult.error.message}`
    );
  }
  const { metronomeContractId } = contractResult.value;

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

  await invalidateContractCache(owner.sId);

  // Seat sync was skipped inline (see `enableSeatSync: false` above). Now that
  // the contract and subscription row exist, reconcile the seat out-of-band —
  // `immediate` skips the debounce so the free seat is assigned promptly, and
  // the workflow's Temporal retries ride out any transient seat-endpoint 429s
  // without blocking signup. Best-effort: a launch failure is backstopped by the
  // debounced sync from the earlier membership seat change.
  const seatSyncResult = await launchMetronomeSeatCountSyncWorkflow({
    workspaceId: owner.sId,
    immediate: true,
  });
  if (seatSyncResult.isErr()) {
    logger.warn(
      { workspaceId: owner.sId, err: seatSyncResult.error },
      "[Metronome] Failed to launch immediate seat-count sync after free-plan provisioning"
    );
  }

  await restoreWorkspaceAfterSubscription(auth);
}

// Called during normal user signup (/trial/start). Provisions the Metronome
// contract and assigns a "free" seat to the workspace creator.
export async function activateCreditPricedFreePlan(
  auth: Authenticator,
  countryCode?: string
): Promise<void> {
  await provisionCreditPricedFreePlan(auth, {
    user: auth.getNonNullableUser(),
    countryCode,
  });
}

// Called during workspace creation via the Poke plugin. No user is present yet
// (the workspace was just created and no member has joined), so seat assignment
// is skipped. Invited users receive a seat type through the membership flow.
export async function activateCreditPricedFreePlanForWorkspace(
  auth: Authenticator,
  countryCode?: string
): Promise<void> {
  await provisionCreditPricedFreePlan(auth, { countryCode });
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
