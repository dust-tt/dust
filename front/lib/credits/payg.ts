import assert from "assert";
import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  isEnterpriseSubscription,
  makeCreditsPAYGInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function allocatePAYGCreditsOnCycleRenewal({
  auth,
  nextPeriodStartSeconds,
  nextPeriodEndSeconds,
}: {
  auth: Authenticator;
  nextPeriodStartSeconds: number;
  nextPeriodEndSeconds: number;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config || config.paygCapCents === null) {
    return new Ok(undefined);
  }

  const nextPeriodStartDate = new Date(nextPeriodStartSeconds * 1000);
  const nextPeriodEndDate = new Date(nextPeriodEndSeconds * 1000);

  const existingCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    nextPeriodStartDate,
    nextPeriodEndDate
  );

  if (existingCredit) {
    logger.info(
      { workspaceId: workspace.sId, creditId: existingCredit.id },
      "[Credit PAYG] Credit already exists for this period, skipping allocation"
    );
    return new Ok(undefined);
  }
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
    return new Ok(undefined);
  }

  const credit = await CreditResource.makeNew(auth, {
    type: "payg",
    initialAmountCents: config.paygCapCents,
    consumedAmountCents: 0,
    discount: config.defaultDiscountPercent,
    invoiceOrLineItemId: null,
  });

  const startResult = await credit.start(
    nextPeriodStartDate,
    nextPeriodEndDate
  );
  if (startResult.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        creditId: credit.id,
        error: startResult.error.message,
      },
      "[Credit PAYG] Credit already started, skipping"
    );
    return new Ok(undefined);
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

  return new Ok(undefined);
}

export async function isPAYGEnabled(auth: Authenticator): Promise<boolean> {
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config !== null && config.paygCapCents !== null;
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
  if (!isEnterpriseSubscription(stripeSubscription)) {
    logger.info(
      { workspaceId: workspace.sId },
      "[Credit PAYG] Not an enterprise subscription, skipping arrears invoicing"
    );
    return new Ok(undefined);
  }

  const previousPeriodStartDate = new Date(previousPeriodStartSeconds * 1000);
  const previousPeriodEndDate = new Date(previousPeriodEndSeconds * 1000);

  const paygCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    previousPeriodStartDate,
    previousPeriodEndDate
  );

  assert(
    paygCredit || !paygEnabled,
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

  const invoiceResult = await makeCreditsPAYGInvoice({
    stripeSubscription,
    amountCents: paygCredit.consumedAmountCents,
    periodStartSeconds: previousPeriodStartSeconds,
    periodEndSeconds: previousPeriodEndSeconds,
    idempotencyKey,
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
