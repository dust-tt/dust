import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
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

/**
 * Calculate free credit amount based on brackets system:
 * - First 10 users: $5 each
 * - Next 40 users (11-50): $2 each
 * - Next 50 users (51-100): $1 each
 * - Cap at 100 users
 */
function calculateFreeCreditAmount(userCount: number): number {
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

export async function grantFreeCreditsOnSubscriptionRenewal({
  auth,
  invoice,
  stripeSubscription,
}: {
  auth: Authenticator;
  invoice: Stripe.Invoice;
  stripeSubscription: Stripe.Subscription;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const workspaceSId = workspace.sId;

  // Check if credit already exists for this invoice (idempotency)
  const idempotencyKey = `free-renewal-${invoice.id}`;
  const existingCredit = await CreditResource.fetchByInvoiceOrLineItemId(
    auth,
    idempotencyKey
  );

  if (existingCredit) {
    logger.info(
      {
        workspaceId: workspaceSId,
        creditId: existingCredit.id,
        invoiceId: invoice.id,
      },
      "[Free Credits] Credit already exists for this invoice, skipping"
    );
    return new Ok(undefined);
  }

  logger.info(
    {
      workspaceId: workspaceSId,
      invoiceId: invoice.id,
      subscriptionId: stripeSubscription.id,
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
    // Count active members as of 5 days ago
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const userCount = await MembershipResource.getMembersCountForWorkspace({
      workspace: renderLightWorkspaceType({ workspace }),
      activeOnly: true,
      membershipSpan: { fromDate: fiveDaysAgo, toDate: fiveDaysAgo },
    });

    creditAmountCents = calculateFreeCreditAmount(userCount);

    logger.info(
      {
        workspaceId: workspaceSId,
        userCount,
        countAsOfDate: fiveDaysAgo.toISOString(),
        creditAmountCents,
      },
      "[Free Credits] Calculated credit amount using brackets system"
    );
  }

  // Skip if calculated amount is zero
  if (creditAmountCents === 0) {
    logger.info(
      { workspaceId: workspaceSId },
      "[Free Credits] Skipping credit grant - calculated amount is zero"
    );
    return new Ok(undefined);
  }

  // Create the credit
  const expirationDate = new Date(stripeSubscription.current_period_end * 1000);
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
