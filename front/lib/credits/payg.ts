import assert from "assert";
import type Stripe from "stripe";

import { MAX_DISCOUNT_PERCENT } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  ENTERPRISE_N30_PAYMENTS_DAYS,
  isEnterpriseSubscription,
  makeAndFinalizeCreditsPAYGInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

async function createPAYGCreditForPeriod({
  auth,
  paygCapCents,
  discountPercent,
  periodStart,
  periodEnd,
}: {
  auth: Authenticator;
  paygCapCents: number;
  discountPercent: number;
  periodStart: Date;
  periodEnd: Date;
}): Promise<Result<CreditResource, Error>> {
  if (discountPercent > MAX_DISCOUNT_PERCENT) {
    return new Err(
      new Error(
        `Discount cannot exceed ${MAX_DISCOUNT_PERCENT}% (would result in selling below cost)`
      )
    );
  }

  const existingCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    periodStart,
    periodEnd
  );

  if (existingCredit) {
    return new Err(new Error("Credit already exists for this period"));
  }

  const credit = await CreditResource.makeNew(auth, {
    type: "payg",
    initialAmountCents: paygCapCents,
    consumedAmountCents: 0,
    discount: discountPercent,
    invoiceOrLineItemId: null,
  });

  await credit.start(periodStart, periodEnd);
  return new Ok(credit);
}

export async function allocatePAYGCreditsOnCycleRenewal({
  auth,
  nextPeriodStartSeconds,
  nextPeriodEndSeconds,
}: {
  auth: Authenticator;
  nextPeriodStartSeconds: number;
  nextPeriodEndSeconds: number;
}): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config || config.paygCapCents === null) {
    return;
  }

  const nextPeriodStartDate = new Date(nextPeriodStartSeconds * 1000);
  const nextPeriodEndDate = new Date(nextPeriodEndSeconds * 1000);

  const featureFlags = await getFeatureFlags(workspace);
  if (!featureFlags.includes("ppul")) {
    logger.info(
      {
        workspaceId: workspace.sId,
        initialAmountCents: config.paygCapCents,
        periodStart: nextPeriodStartDate.toISOString(),
        periodEnd: nextPeriodEndDate.toISOString(),
      },
      "[Credit PAYG] PPUL flag OFF - stopping here."
    );
    return;
  }

  const result = await createPAYGCreditForPeriod({
    auth,
    paygCapCents: config.paygCapCents,
    discountPercent: config.defaultDiscountPercent,
    periodStart: nextPeriodStartDate,
    periodEnd: nextPeriodEndDate,
  });

  if (result.isErr()) {
    logger.info(
      { workspaceId: workspace.sId, error: result.error.message },
      "[Credit PAYG] Credit already exists for this period, skipping allocation"
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      initialAmountCents: config.paygCapCents,
      periodStart: nextPeriodStartDate.toISOString(),
      periodEnd: nextPeriodEndDate.toISOString(),
    },
    "[Credit PAYG] Allocated new PAYG credit for billing cycle"
  );
}

export async function isPAYGEnabled(auth: Authenticator): Promise<boolean> {
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("ppul")) {
    return false;
  }
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config !== null && config.paygCapCents !== null;
}

export async function startOrResumeEnterprisePAYG({
  auth,
  stripeSubscription,
  paygCapCents,
}: {
  auth: Authenticator;
  stripeSubscription: Stripe.Subscription;
  paygCapCents: number;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  assert(
    isEnterpriseSubscription(stripeSubscription),
    "startOrResumeEnterprisePAYG called with non-enterprise subscription"
  );

  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config) {
    return new Err(
      new Error(
        "Programmatic usage configuration must exist before enabling PAYG"
      )
    );
  }

  const updateResult = await config.updateConfiguration(auth, { paygCapCents });
  if (updateResult.isErr()) {
    return updateResult;
  }

  const featureFlags = await getFeatureFlags(workspace);
  if (!featureFlags.includes("ppul")) {
    logger.info(
      { workspaceId: workspace.sId },
      "[Credit PAYG] PPUL flag OFF - config updated but no credit created"
    );
    return new Ok(undefined);
  }

  const currentPeriodStart = new Date(
    stripeSubscription.current_period_start * 1000
  );
  const currentPeriodEnd = new Date(
    stripeSubscription.current_period_end * 1000
  );

  const result = await createPAYGCreditForPeriod({
    auth,
    paygCapCents,
    discountPercent: config.defaultDiscountPercent,
    periodStart: currentPeriodStart,
    periodEnd: currentPeriodEnd,
  });

  if (result.isErr()) {
    logger.info(
      { workspaceId: workspace.sId, error: result.error.message },
      "[Credit PAYG] Credit already exists for current period"
    );
  } else {
    logger.info(
      {
        workspaceId: workspace.sId,
        periodStart: currentPeriodStart.toISOString(),
        periodEnd: currentPeriodEnd.toISOString(),
      },
      "[Credit PAYG] Allocated PAYG credit for current period"
    );
  }

  return new Ok(undefined);
}

export async function stopEnterprisePAYG({
  auth,
  stripeSubscription,
}: {
  auth: Authenticator;
  stripeSubscription: Stripe.Subscription;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const currentPeriodStart = new Date(
    stripeSubscription.current_period_start * 1000
  );
  const currentPeriodEnd = new Date(
    stripeSubscription.current_period_end * 1000
  );

  const paygCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    currentPeriodStart,
    currentPeriodEnd
  );

  if (paygCredit) {
    const freezeResult = await CreditResource.freezePAYGCreditById(
      auth,
      paygCredit.id
    );
    if (freezeResult.isErr()) {
      logger.warn(
        { workspaceId: workspace.sId, error: freezeResult.error.message },
        "[Credit PAYG] Failed to freeze credit"
      );
      return freezeResult;
    }
    logger.info(
      { workspaceId: workspace.sId, creditId: paygCredit.id },
      "[Credit PAYG] Froze current PAYG credit"
    );
  }

  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (config) {
    const result = await config.updateConfiguration(auth, {
      paygCapCents: null,
    });
    if (result.isErr()) {
      return result;
    }
  }

  logger.info({ workspaceId: workspace.sId }, "[Credit PAYG] PAYG disabled");
  return new Ok(undefined);
}

export async function invoiceEnterprisePAYGCredits({
  auth,
  stripeSubscription,
  previousPeriodStartSeconds,
  previousPeriodEndSeconds,
}: {
  auth: Authenticator;
  stripeSubscription: Stripe.Subscription;
  previousPeriodStartSeconds: number;
  previousPeriodEndSeconds: number;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const paygEnabled = await isPAYGEnabled(auth);

  assert(
    isEnterpriseSubscription(stripeSubscription) && paygEnabled,
    "Unreachable: [Credit PAYG] Not an enterprise subscription or PAYG not enabled."
  );

  const previousPeriodStartDate = new Date(previousPeriodStartSeconds * 1000);
  const previousPeriodEndDate = new Date(previousPeriodEndSeconds * 1000);

  const paygCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    previousPeriodStartDate,
    previousPeriodEndDate
  );

  assert(
    paygCredit,
    `[Credit PAYG] No PAYG credit found for period ${previousPeriodStartDate.toISOString()} - ${previousPeriodEndDate.toISOString()} in workspace ${workspace.sId}`
  );

  if (paygCredit.consumedAmountCents === 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        creditId: paygCredit.id,
      },
      "[Credit PAYG] No consumption in this period, skipping invoice"
    );
    return new Ok(undefined);
  }

  const idempotencyKey = `credits-payg-arrears-${paygCredit.sId}`;
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  const discountPercent = config?.defaultDiscountPercent ?? 0;

  logger.info(
    {
      workspaceId: workspace.sId,
      creditId: paygCredit.id,
      consumedAmountCents: paygCredit.consumedAmountCents,
      discountPercent,
      periodStart: previousPeriodStartDate.toISOString(),
      periodEnd: previousPeriodEndDate.toISOString(),
    },
    "[Credit PAYG] Creating arrears invoice"
  );

  const invoiceResult = await makeAndFinalizeCreditsPAYGInvoice({
    stripeSubscription,
    amountCents: paygCredit.consumedAmountCents,
    periodStartSeconds: previousPeriodStartSeconds,
    periodEndSeconds: previousPeriodEndSeconds,
    idempotencyKey,
    daysUntilDue: ENTERPRISE_N30_PAYMENTS_DAYS,
  });

  if (invoiceResult.isErr()) {
    if (invoiceResult.error.error_type === "idempotency") {
      logger.warn(
        {
          workspaceId: workspace.sId,
          idempotencyKey,
        },
        "[Credit PAYG] Invoice already created (idempotency), skipping"
      );
      return new Err(new Error("Invoice already created (idempotency)"));
    }

    logger.error(
      {
        panic: true,
        workspaceId: workspace.sId,
        error: invoiceResult.error.error_message,
      },
      "[Credit PAYG] Failed to create invoice"
    );
    return new Err(new Error("Failed to create Credits PAYG invoice"));
  }

  await paygCredit.markAsPaid(invoiceResult.value.id);

  return new Ok(undefined);
}
