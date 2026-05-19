import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { floorToHourISO } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { loadFirstPeriodCredit } from "@app/lib/metronome/credits";
import { PlanModel } from "@app/lib/models/plan";
import { resolvePackageAliasForCurrency } from "@app/lib/plans/billing_currency";
import { getStripeClient } from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchWorkOSWorkspaceSubscriptionCreatedWorkflow } from "@app/temporal/workos_events_queue/client";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Provisions a Metronome subscription after the first-period payment has been collected.
 * Sets the payment method as the customer's Stripe default, creates/ensures the Metronome
 * customer and contract, loads a first-period credit to zero out the first Metronome
 * invoice, creates the DB subscription, and restores the workspace.
 */
export async function provisionMetronomeFirstPeriodSubscription({
  stripeCustomerId,
  paymentMethodId,
  subtotalCents,
  currency,
  workspaceId,
  userId,
  planCode,
  metronomePackageAlias,
  firstPeriodPaymentEnforced,
  uniquenessKey,
  now,
}: {
  stripeCustomerId: string;
  paymentMethodId: string;
  subtotalCents: number;
  currency: string;
  workspaceId: string;
  userId: string;
  planCode: string;
  metronomePackageAlias: string;
  firstPeriodPaymentEnforced: boolean;
  uniquenessKey: string;
  now: Date;
}): Promise<Result<void, DustError>> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return new Err(
      new DustError(
        "workspace_not_found",
        `Workspace ${workspaceId} not found for Metronome setup session.`
      )
    );
  }

  logger.info(
    {
      uniquenessKey,
      workspaceId,
      planCode,
      userId,
      metronomePackageAlias,
      stripeCustomerId,
    },
    "[Metronome] Handle metronome checkout"
  );

  // Set the payment method as the customer's default for future Metronome-generated
  // invoices (month 2+). Must be done before provisioning so the PM is in place
  // before any invoice is attempted.
  const stripe = getStripeClient();
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const validCurrency = isSupportedCurrency(currency) ? currency : "usd";
  const resolvedPackageAlias = resolvePackageAliasForCurrency(
    metronomePackageAlias,
    validCurrency
  );

  const plan = await PlanModel.findOne({ where: { code: planCode } });
  if (!plan) {
    return new Err(
      new DustError("plan_not_found", `Plan ${planCode} not found.`)
    );
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: lightWorkspace,
    stripeCustomerId,
  });
  if (customerResult.isErr()) {
    return new Err(
      new DustError("metronome_error", customerResult.error.message)
    );
  }
  const { metronomeCustomerId } = customerResult.value;

  const authAdmin = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );

  if (firstPeriodPaymentEnforced) {
    // Zero out the first Metronome-generated invoice. The customer already paid
    // via the Stripe invoice. subtotalCents is pre-tax — exactly the amount that
    // Metronome will generate for the first period.
    const creditResult = await loadFirstPeriodCredit({
      metronomeCustomerId,
      amountCents: subtotalCents,
      currency: validCurrency,
      uniquenessKey,
      now,
    });
    if (creditResult.isErr()) {
      return new Err(
        new DustError("metronome_error", creditResult.error.message)
      );
    }
  }

  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    packageAlias: resolvedPackageAlias,
    uniquenessKey,
    startingAt: new Date(floorToHourISO(now)),
    planCode,
  });
  if (contractResult.isErr()) {
    return new Err(
      new DustError("metronome_error", contractResult.error.message)
    );
  }
  const { metronomeContractId } = contractResult.value;

  const subscriptionResult =
    await SubscriptionResource.createSubscriptionFromCheckout({
      workspaceModelId: workspace.id,
      plan,
      metronomeContractId,
      now,
    });
  if (subscriptionResult.isErr()) {
    return subscriptionResult;
  }

  const workspaceSeats = await MembershipResource.countActiveSeatsInWorkspace(
    workspace.sId
  );
  await ServerSideTracking.trackSubscriptionCreated({
    workspace: lightWorkspace,
    planCode,
    workspaceSeats,
    subscriptionStartAt: now,
  });

  await restoreWorkspaceAfterSubscription(authAdmin);
  await launchWorkOSWorkspaceSubscriptionCreatedWorkflow({ workspaceId });

  logger.info(
    { workspaceId, metronomeContractId, uniquenessKey },
    "[Metronome] Checkout completed"
  );

  return new Ok(undefined);
}
