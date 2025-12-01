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
import { Err, Ok } from "@app/types";

const BRACKET_1_USERS = 10;
const BRACKET_1_CENTS_PER_USER = 500; // $5
const BRACKET_2_USERS = 40; // 11-50
const BRACKET_2_CENTS_PER_USER = 200; // $2
const BRACKET_3_USERS = 50; // 51-100
const BRACKET_3_CENTS_PER_USER = 100; // $1

const MONTHLY_BILLING_CYCLE_SECONDS = 30 * 24 * 60 * 60; // ~30 days

// 5 days
const USER_COUNT_CUTOFF = 5 * 24 * 60 * 60 * 1000;
const MAX_ELIGIBLE_USERS_FIRST_CYCLE = 1;

/**
 * Calculate free credit amount based on brackets system:
 * - First 10 users: $5 each
 * - Next 40 users (11-50): $2 each
 * - Next 50 users (51-100): $1 each
 * - Cap at 100 users
 */
export function calculateFreeCreditAmount(userCount: number): number {
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
    usersInBracket1 * BRACKET_1_CENTS_PER_USER +
    usersInBracket2 * BRACKET_2_CENTS_PER_USER +
    usersInBracket3 * BRACKET_3_CENTS_PER_USER
  );
}

/**
 * This function exists to make it not worth it for people to bump up / down
 * the number of users before billing cycle renewal.
 * Why 5 days ? At the current price of $30 / month,
 * pro-rated bump up from 5 days ago would be 5$.
 */
export async function countEligibleUsersForFreeCredits(
  workspace: Parameters<typeof renderLightWorkspaceType>[0]["workspace"],
  subscriptionStartMs: number
): Promise<number> {
  // New customers (subscription started within the cutoff period) get 1 user worth of credits ($5)
  if (subscriptionStartMs > Date.now() - USER_COUNT_CUTOFF) {
    return MAX_ELIGIBLE_USERS_FIRST_CYCLE;
  }

  const cutoffDate = new Date(Date.now() - USER_COUNT_CUTOFF);
  return MembershipResource.getMembersCountForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
    activeOnly: true,
    membershipSpan: { fromDate: cutoffDate, toDate: cutoffDate },
  });
}

/**
 * For enterprise: always eligible
 * For pro:
 *   if you are a "good payer" (last paid subscription invoice less than 2 months ago), eligible
 * Otherwise, not eligible
 */
export async function isSubscriptionEligibleForFreeCredits(
  stripeSubscription: Stripe.Subscription
): Promise<boolean> {
  const paidInvoices = await getSubscriptionInvoices(stripeSubscription.id, {
    status: "paid",
    limit: 1,
  });

  if (!paidInvoices || paidInvoices.length === 0) {
    return false;
  }

  // Check if most recent paid invoice is within 2 billing cycles
  const mostRecentInvoice = paidInvoices[0];
  const currentPeriodStart = stripeSubscription.current_period_start;
  const invoicePeriodEnd = mostRecentInvoice.period_end;
  const ageSeconds = currentPeriodStart - invoicePeriodEnd;

  return ageSeconds <= MONTHLY_BILLING_CYCLE_SECONDS * 2;
}

export async function grantFreeCreditsOnSubscriptionRenewal({
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

  if (!isEnterprise) {
    // For Pro subscriptions, check eligibility based on payment history
    if (!(await isSubscriptionEligibleForFreeCredits(stripeSubscription))) {
      logger.info(
        {
          workspaceId: workspaceSId,
          subscriptionId: stripeSubscription.id,
        },
        "[Free Credits] Pro subscription not eligible for free credits (subscription payment too old or missing)"
      );
      return new Ok(undefined);
    }
  }

  logger.info(
    {
      workspaceId: workspaceSId,
      subscriptionId: stripeSubscription.id,
      isEnterprise,
    },
    "[Free Credits] Processing free credit grant on subscription renewal"
  );

  let creditAmountCents: number;

  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

  if (programmaticConfig && programmaticConfig.freeCreditCents !== null) {
    creditAmountCents = programmaticConfig.freeCreditCents;
    logger.info(
      {
        workspaceId: workspaceSId,
        creditAmountCents,
      },
      "[Free Credits] Using ProgrammaticUsageConfiguration override amount"
    );
  } else {
    const subscriptionStartMs = stripeSubscription.start_date * 1000;
    const userCount = await countEligibleUsersForFreeCredits(
      workspace,
      subscriptionStartMs
    );
    creditAmountCents = calculateFreeCreditAmount(userCount);

    logger.info(
      {
        workspaceId: workspaceSId,
        userCount,
        creditAmountCents,
      },
      "[Free Credits] Calculated credit amount using brackets system"
    );
    assert(
      creditAmountCents > 0,
      "Unexpected programmatic usage free credit amount equal to zero"
    );
  }

  const expirationDate = new Date(stripeSubscription.current_period_end * 1000);
  const featureFlags = await getFeatureFlags(workspace);
  if (!featureFlags.includes("ppul")) {
    logger.info(
      {
        workspaceId: workspaceSId,
        creditAmountCents,
        expirationDate,
      },
      "[Free Credits] PPUL flag OFF - stopping here."
    );
    return new Ok(undefined);
  }
  const credit = await CreditResource.makeNew(auth, {
    type: "free",
    initialAmountCents: creditAmountCents,
    consumedAmountCents: 0,
    discount: null,
    invoiceOrLineItemId: idempotencyKey,
  });

  logger.info(
    {
      workspaceId: workspaceSId,
      creditId: credit.id,
      creditAmountCents,
      expirationDate,
    },
    "[Free Credits] Created credit, now starting"
  );

  // Start the credit immediately
  const startResult = await credit.start(undefined, expirationDate);

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
      creditAmountCents,
      expirationDate,
    },
    "[Free Credits] Successfully granted and activated free credit on renewal"
  );

  return new Ok(undefined);
}
