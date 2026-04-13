import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { provisionMetronomeCustomerAndContract } from "@app/lib/metronome/contracts";
import { PlanModel } from "@app/lib/models/plan";
import {
  getBillingCurrencyForCountry,
  resolvePackageAliasForCurrency,
} from "@app/lib/plans/billing_currency";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { launchWorkOSWorkspaceSubscriptionCreatedWorkflow } from "@app/temporal/workos_events_queue/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type Stripe from "stripe";
import { z } from "zod";

const StripeSetupSessionSchema = z.object({
  id: z.string(),
  client_reference_id: z.string(),
  metadata: z.object({
    planCode: z.string(),
    userId: z.string().optional(),
    metronomePackageAlias: z.string(),
  }),
  customer: z.string(),
  customer_details: z
    .object({
      address: z
        .object({
          country: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export async function handleMetronomeSetupCheckout({
  session,
  now,
}: {
  session: Stripe.Checkout.Session;
  now: Date;
}): Promise<Result<void, DustError>> {
  const parsed = StripeSetupSessionSchema.safeParse(session);
  if (!parsed.success) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Invalid Metronome setup session: ${parsed.error.message}`
      )
    );
  }

  const {
    id: sessionId,
    client_reference_id: workspaceId,
    metadata: { planCode, userId, metronomePackageAlias },
    customer: stripeCustomerId,
    customer_details: customerDetails,
  } = parsed.data;

  // Resolve the package alias based on the customer's billing country.
  // Stripe populates customer_details.address.country from billing_address_collection.
  const customerCountry = customerDetails?.address?.country;
  const billingCurrency = customerCountry
    ? getBillingCurrencyForCountry(customerCountry, true)
    : "usd";
  const resolvedPackageAlias = resolvePackageAliasForCurrency(
    metronomePackageAlias,
    billingCurrency
  );

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return new Err(
      new DustError(
        "workspace_not_found",
        `Workspace ${workspaceId} not found for Metronome setup session.`
      )
    );
  }

  const plan = await PlanModel.findOne({ where: { code: planCode } });
  if (!plan) {
    return new Err(
      new DustError("plan_not_found", `Plan ${planCode} not found.`)
    );
  }

  const provisionResult = await provisionMetronomeCustomerAndContract({
    workspace: renderLightWorkspaceType({ workspace }),
    stripeCustomerId,
    packageAlias: resolvedPackageAlias,
    uniquenessKey: sessionId,
  });
  if (provisionResult.isErr()) {
    return new Err(
      new DustError("metronome_error", provisionResult.error.message)
    );
  }

  const { metronomeCustomerId, metronomeContractId } = provisionResult.value;

  const updateResult = await WorkspaceResource.updateMetronomeCustomerId(
    workspace.id,
    metronomeCustomerId
  );
  if (updateResult.isErr()) {
    return new Err(new DustError("internal_error", updateResult.error.message));
  }

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

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  if (userId) {
    const workspaceSeats = await MembershipResource.countActiveSeatsInWorkspace(
      workspace.sId
    );
    await ServerSideTracking.trackSubscriptionCreated({
      userId,
      workspace: renderLightWorkspaceType({ workspace }),
      planCode,
      workspaceSeats,
      subscriptionStartAt: now,
    });
  }

  await restoreWorkspaceAfterSubscription(auth);

  await launchWorkOSWorkspaceSubscriptionCreatedWorkflow({ workspaceId });

  return new Ok(undefined);
}
