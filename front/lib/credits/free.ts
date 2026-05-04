import type { Authenticator } from "@app/lib/auth";
import {
  getSubscriptionInvoices,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type Stripe from "stripe";

const BRACKET_1_USERS = 10;
const BRACKET_1_MICRO_USD_PER_USER = 5_000_000; // $5
const BRACKET_2_USERS = 40; // 11-50
const BRACKET_2_MICRO_USD_PER_USER = 2_000_000; // $2
const BRACKET_3_USERS = 50; // 51-100
const BRACKET_3_MICRO_USD_PER_USER = 1_000_000; // $1

const MONTHLY_BILLING_CYCLE_SECONDS = 30 * 24 * 60 * 60; // ~30 days
const YEARLY_BILLING_CYCLE_SECONDS = 365 * 24 * 60 * 60; // ~365 days

// 5 days
const USER_COUNT_CUTOFF = 5 * 24 * 60 * 60 * 1000;

type CustomerPaymentStatus = "paying" | "not_paying" | "trialing";

function getBillingInterval(
  stripeSubscription: Stripe.Subscription
): "month" | "year" {
  const item = stripeSubscription.items.data[0];
  if (!item?.price.recurring) {
    logger.error(
      {
        panic: true,
        stripeSubscriptionId: stripeSubscription.id,
      },
      "Unexpected: Cannot have a non-recurring item in a subscription"
    );
    return "month";
  }
  return item.price.recurring.interval === "year" ? "year" : "month";
}

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

  const billingInterval = getBillingInterval(stripeSubscription);
  const lookbackSeconds =
    billingInterval === "year"
      ? YEARLY_BILLING_CYCLE_SECONDS + MONTHLY_BILLING_CYCLE_SECONDS // ~13 months
      : MONTHLY_BILLING_CYCLE_SECONDS * 2; // ~60 days

  const paidInvoices = await getSubscriptionInvoices({
    subscriptionId: stripeSubscription.id,
    status: "paid",
    createdSinceDate: new Date(Date.now() - lookbackSeconds * 1000),
  });

  if (paidInvoices && paidInvoices.length > 0) {
    return "paying";
  }

  if (isTrialingOrNewCustomer(stripeSubscription)) {
    return "trialing";
  }

  return "not_paying";
}

export const YEARLY_MULTIPLIER = 12;

/**
 * Create + start the DB free credit corresponding to a Metronome recurring
 * free credit segment. Called by the Metronome webhook on
 * `credit.segment.start` — Metronome is the source of truth for the
 * recurring free credit, so the DB credit's dates and id are taken straight
 * from the Metronome segment.
 *
 * Idempotent: if a free credit already exists for the same period (e.g.
 * because the contract was dropped and recreated within the same billing
 * cycle), the existing credit is returned unchanged.
 */
export async function grantFreeCreditFromMetronomeSegment({
  auth,
  metronomeCreditId,
  contractId,
  segmentId,
  isAnnual,
  amountMicroUsd,
  periodStart,
  periodEnd,
}: {
  auth: Authenticator;
  metronomeCreditId: string;
  contractId: string;
  segmentId: string;
  isAnnual: boolean;
  amountMicroUsd: number;
  periodStart: Date;
  periodEnd: Date;
}): Promise<
  Result<
    { credit: CreditResource; created: boolean; alreadyExisted: boolean },
    Error
  >
> {
  const workspace = auth.getNonNullableWorkspace();

  // Contract recreations can re-fire credit.segment.start for a period
  // we've already provisioned. The (workspaceId, type, startDate,
  // expirationDate) unique index would block re-creation in start();
  // we leave the original DB credit untouched and skip.
  const existingForPeriod = await CreditResource.fetchByTypeAndDates(
    auth,
    "free",
    periodStart,
    periodEnd
  );
  if (existingForPeriod) {
    logger.info(
      {
        workspaceId: workspace.sId,
        existingCreditId: existingForPeriod.id,
        existingMetronomeCreditId: existingForPeriod.metronomeCreditId,
        newMetronomeCreditId: metronomeCreditId,
        segmentId,
        contractId,
        periodStart,
        periodEnd,
      },
      "[Free Credits] free credit already exists for this period (likely contract recreated), ignoring"
    );
    return new Ok({
      credit: existingForPeriod,
      created: false,
      alreadyExisted: true,
    });
  }

  // Mirrors the Stripe-side `free-renewal-...` key format, with the
  // Metronome contract id substituted for the Stripe subscription id and
  // the period start in unix seconds.
  const periodStartSeconds = Math.floor(periodStart.getTime() / 1000);
  const idempotencyKey = isAnnual
    ? `free-renewal-yearly-${contractId}-${periodStartSeconds}`
    : `free-renewal-${contractId}-${periodStartSeconds}`;

  const { credit, created } =
    await CreditResource.makeNewOrFetchByInvoiceOrLineItemId(auth, {
      type: "free",
      initialAmountMicroUsd: amountMicroUsd,
      consumedAmountMicroUsd: 0,
      discount: null,
      invoiceOrLineItemId: idempotencyKey,
      metronomeCreditId,
    });

  if (created) {
    const startResult = await credit.start(auth, {
      startDate: periodStart,
      expirationDate: periodEnd,
    });
    if (startResult.isErr()) {
      logger.error(
        {
          panic: true,
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          segmentId,
          error: startResult.error,
        },
        "[Free Credits] failed to start DB credit from metronome credit segment"
      );
      return new Err(startResult.error);
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      creditId: credit.id,
      metronomeCreditId,
      segmentId,
      contractId,
      amountMicroUsd,
      isAnnual,
      created,
      periodStart,
      periodEnd,
    },
    "[Free Credits] DB free credit ensured from metronome credit segment"
  );

  return new Ok({ credit, created, alreadyExisted: false });
}
