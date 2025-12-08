import assert from "assert";
import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getSubscriptionInvoices,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

const BRACKET_1_USERS = 10;
const BRACKET_1_MICRO_USD_PER_USER = 5_000_000; // $5
const BRACKET_2_USERS = 40; // 11-50
const BRACKET_2_MICRO_USD_PER_USER = 2_000_000; // $2
const BRACKET_3_USERS = 50; // 51-100
const BRACKET_3_MICRO_USD_PER_USER = 1_000_000; // $1

const TRIAL_CREDIT_MICRO_USD = 5_000_000; // $5

const MONTHLY_BILLING_CYCLE_SECONDS = 30 * 24 * 60 * 60; // ~30 days

// 5 days
const USER_COUNT_CUTOFF = 5 * 24 * 60 * 60 * 1000;

type CustomerPaymentStatus = "paying" | "not_paying" | "trialing";

/**
 * Returns true if
 * Customer's subscription is in trial
 * OR if customer's subscription is less than one month old
 * This is done so that customers who recently converted still get
 * the trial 5$ credit on their new billing cycle
 * (triggered when converted to from trial to active)
 * This is required because of race conditions between Stripe's subscription.updated and invoice.paid
 */
function isTrialingOrNewCustomer(
  stripeSubscription: Stripe.Subscription
): boolean {
  const subscriptionStartSec = stripeSubscription.start_date;
  const nowSec = Math.floor(Date.now() / 1000);
  const oneMonthAgoSec = nowSec - MONTHLY_BILLING_CYCLE_SECONDS;
  const isNewCustomer = subscriptionStartSec >= oneMonthAgoSec;
  return stripeSubscription.status === "trialing" || isNewCustomer;
}

/**
 * Calculate free credit amount based on brackets system:
 * - First 10 users: $5 each
 * - Next 40 users (11-50): $2 each
 * - Next 50 users (51-100): $1 each
 * - Cap at 100 users
 */
export function calculateFreeCreditAmountMicroUsd(userCount: number): number {
  const usersInBracket1 = Math.min(BRACKET_1_USERS, userCount);
  const usersInBracket2 = Math.min(
    BRACKET_2_USERS,
    Math.max(0, userCount - BRACKET_1_USERS)
  );
  const usersInBracket3 = Math.min(
    BRACKET_3_USERS,
    Math.max(0, userCount - BRACKET_1_USERS - BRACKET_2_USERS)
  );

  return (
    usersInBracket1 * BRACKET_1_MICRO_USD_PER_USER +
    usersInBracket2 * BRACKET_2_MICRO_USD_PER_USER +
    usersInBracket3 * BRACKET_3_MICRO_USD_PER_USER
  );
}

/**
 * This function exists to make it not worth it for people to bump up / down
 * the number of users before billing cycle renewal.
 * Why 5 days ? At the current price of $30 / month,
 * pro-rated bump up from 5 days ago would be 5$.
 *
 * However, at minimum we always count 1 user.
 */
export async function countEligibleUsersForFreeCredits(
  workspace: Parameters<typeof renderLightWorkspaceType>[0]["workspace"]
): Promise<number> {
  const cutoffDate = new Date(Date.now() - USER_COUNT_CUTOFF);
  const count = await MembershipResource.getMembersCountForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
    activeOnly: true,
    membershipSpan: { fromDate: cutoffDate, toDate: cutoffDate },
  });
  return Math.max(1, count);
}

/**
 * Customer payment status.
 * - "paying": Has recent paid invoice (within 2 billing cycles)
 * - "trialing": No paid invoice but trialing or new customer
 * - "not_paying": No recent payment and not trialing/new
 */
export async function getCustomerPaymentStatus(
  stripeSubscription: Stripe.Subscription
): Promise<CustomerPaymentStatus> {
  // Enterprise subscriptions are always considered paying.
  if (isEnterpriseSubscription(stripeSubscription)) {
    return "paying";
  }

  const paidInvoices = await getSubscriptionInvoices({
    subscriptionId: stripeSubscription.id,
    status: "paid",
    createdSinceDate: new Date(
      Date.now() - MONTHLY_BILLING_CYCLE_SECONDS * 2 * 1000
    ),
  });

  if (paidInvoices && paidInvoices.length > 0) {
    return "paying";
  }

  if (isTrialingOrNewCustomer(stripeSubscription)) {
    return "trialing";
  }

  return "not_paying";
}

export async function grantFreeCreditsFromSubscriptionStateChange({
  auth,
  stripeSubscription,
}: {
  auth: Authenticator;
  stripeSubscription: Stripe.Subscription;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const workspaceSId = workspace.sId;

  // Check if credit already exists for this billing cycle (idempotency)
  const idempotencyKey = `free-renewal-${stripeSubscription.id}-${stripeSubscription.current_period_start}`;
  const existingCredit = await CreditResource.fetchByInvoiceOrLineItemId(
    auth,
    idempotencyKey
  );

  if (existingCredit) {
    logger.info(
      {
        workspaceId: workspaceSId,
        creditId: existingCredit.id,
        subscriptionId: stripeSubscription.id,
      },
      "[Free Credits] Credit already exists for this billing cycle, skipping"
    );
    return new Ok(undefined);
  }

  // Enterprise subscriptions are always eligible
  const isEnterprise = isEnterpriseSubscription(stripeSubscription);
  const customerPaymentStatus: CustomerPaymentStatus =
    await getCustomerPaymentStatus(stripeSubscription);

  logger.info(
    {
      workspaceId: workspaceSId,
      subscriptionId: stripeSubscription.id,
      isEnterprise,
    },
    "[Free Credits] Processing free credit grant on subscription renewal"
  );

  let creditAmountMicroUsd: number;

  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

  if (
    programmaticConfig &&
    programmaticConfig.freeCreditMicroUsd !== null &&
    customerPaymentStatus === "paying"
  ) {
    creditAmountMicroUsd = programmaticConfig.freeCreditMicroUsd;
    logger.info(
      {
        workspaceId: workspaceSId,
        creditAmountMicroUsd,
      },
      "[Free Credits] Using ProgrammaticUsageConfiguration override amount"
    );
  } else {
    switch (customerPaymentStatus) {
      case "not_paying":
        logger.info(
          {
            workspaceId: workspaceSId,
            subscriptionId: stripeSubscription.id,
          },
          "[Free Credits] Pro subscription not eligible for free credits (subscription payment too old or missing)"
        );
        return new Err(
          new Error("Pro subscription not eligible for free credits")
        );
      case "trialing":
        creditAmountMicroUsd = TRIAL_CREDIT_MICRO_USD;
        break;
      case "paying":
        const userCount = await countEligibleUsersForFreeCredits(workspace);
        creditAmountMicroUsd = calculateFreeCreditAmountMicroUsd(userCount);
        logger.info(
          {
            workspaceId: workspaceSId,
            userCount,
            creditAmountMicroUsd,
            customerPaymentStatus,
          },
          "[Free Credits] Calculated credit amount using brackets system"
        );
        break;
      default:
        assertNever(customerPaymentStatus);
    }

    assert(
      creditAmountMicroUsd > 0,
      "Unexpected programmatic usage free credit amount equal to zero"
    );
  }

  const periodStart = new Date(stripeSubscription.current_period_start * 1000);
  const periodEnd = new Date(stripeSubscription.current_period_end * 1000);

  const credit = await CreditResource.makeNew(auth, {
    type: "free",
    initialAmountMicroUsd: creditAmountMicroUsd,
    consumedAmountMicroUsd: 0,
    discount: null,
    invoiceOrLineItemId: idempotencyKey,
  });

  logger.info(
    {
      workspaceId: workspaceSId,
      creditId: credit.id,
      creditAmountMicroUsd,
      periodStart,
      periodEnd,
    },
    "[Free Credits] Created credit, now starting"
  );

  // Start the credit at beginning of billing cycle.
  const startResult = await credit.start(auth, {
    startDate: periodStart,
    expirationDate: periodEnd,
  });
  if (startResult.isErr()) {
    logger.error(
      {
        panic: true,
        workspaceId: workspaceSId,
        creditId: credit.id,
        error: startResult.error,
      },
      "[Free Credits] Error starting credit"
    );
    return new Err(startResult.error);
  }

  logger.info(
    {
      workspaceId: workspaceSId,
      creditId: credit.id,
      creditAmountMicroUsd,
      periodStart,
      periodEnd,
    },
    "[Free Credits] Successfully granted and activated free credit on renewal"
  );

  return new Ok(undefined);
}
