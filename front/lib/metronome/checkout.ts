import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { floorToHourISO } from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { redeemCoupon } from "@app/lib/metronome/coupons";
import { PlanModel } from "@app/lib/models/plan";
import {
  resolveCurrencyFromStripe,
  resolvePackageAliasForCurrency,
} from "@app/lib/plans/billing_currency";
import { getStripeClient, getStripeCustomer } from "@app/lib/plans/stripe";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
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
    couponCode: z.string().optional(),
  }),
  customer: z.string(),
  setup_intent: z.string().nullable().optional(),
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

async function getSetupIntentDetails({
  setupIntentId,
}: {
  setupIntentId: string;
}): Promise<{ paymentMethodId: string | null; country: string | null }> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });
  const pm = setupIntent.payment_method;
  if (pm && typeof pm !== "string") {
    return {
      paymentMethodId: pm.id,
      country: pm.billing_details.address?.country ?? null,
    };
  }
  if (typeof pm === "string") {
    return { paymentMethodId: pm, country: null };
  }
  return { paymentMethodId: null, country: null };
}

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
    metadata: { planCode, userId, metronomePackageAlias, couponCode },
    customer: stripeCustomerId,
    customer_details: customerDetails,
    setup_intent: setupIntentId,
  } = parsed.data;

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
      sessionId,
      workspaceId,
      planCode,
      userId,
      metronomePackageAlias,
      stripeCustomerId,
    },
    "[Metronome] Handle metronome checkout"
  );

  // Stripe setup mode attaches the saved PaymentMethod to the customer but
  // does NOT set it as the default for invoicing. Without setting it here,
  // Metronome-generated invoices stay "Incomplete: customer hasn't attempted
  // to pay yet" because Stripe has no default PM to charge off-session.
  // We also reuse the SetupIntent's billing country as a fallback when
  // billing_address_collection: "auto" leaves customer_details.address empty.
  const setupIntentDetails = setupIntentId
    ? await getSetupIntentDetails({ setupIntentId })
    : { paymentMethodId: null, country: null };

  if (setupIntentDetails.paymentMethodId) {
    const stripe = getStripeClient();
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: setupIntentDetails.paymentMethodId,
      },
    });
  } else {
    logger.warn(
      { sessionId, workspaceId, stripeCustomerId, setupIntentId },
      "[Metronome] No payment method on setup intent; default payment method not set. Future invoices may fail to auto-charge."
    );
  }

  const customerCountry =
    customerDetails?.address?.country ?? setupIntentDetails.country;

  const stripeCustomer = await getStripeCustomer(stripeCustomerId);
  const billingCurrency = resolveCurrencyFromStripe({
    stripeCustomer,
    countryFallback: customerCountry,
  });
  const resolvedPackageAlias = resolvePackageAliasForCurrency(
    metronomePackageAlias,
    billingCurrency
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
  const authUser = userId
    ? await Authenticator.fromUserIdAndWorkspaceId(userId, workspace.sId)
    : null;

  if (couponCode) {
    const coupon = await CouponResource.findByCode(couponCode);
    if (!coupon) {
      return new Err(
        new DustError(
          "coupon_redemption_error",
          `Coupon ${couponCode} not found.`
        )
      );
    } else {
      const redeemResult = await redeemCoupon(authUser ?? authAdmin, {
        coupon,
        metronomePackageAlias: resolvedPackageAlias,
      });
      if (redeemResult.isErr()) {
        return new Err(
          new DustError(
            "coupon_redemption_error",
            `Could not apply coupon ${couponCode}.`
          )
        );
      }
    }
  }

  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    packageAlias: resolvedPackageAlias,
    uniquenessKey: sessionId,
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
    { workspaceId, metronomeContractId },
    "[Metronome] Checkout completed"
  );

  return new Ok(undefined);
}
