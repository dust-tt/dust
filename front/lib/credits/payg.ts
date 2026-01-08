import assert from "assert";
import type Stripe from "stripe";

import { MAX_DISCOUNT_PERCENT } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import {
  ENTERPRISE_N30_PAYMENTS_DAYS,
  isEnterpriseSubscription,
  makeAndFinalizeCreditsPAYGInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type { Result } from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

type CreatePAYGCreditError = {
  error_type: "already_exists" | "invalid_discount" | "unknown";
  error_message: string;
};

type HandleErrorResult = { action: "skip" } | { action: "fail"; error: Error };

function handlePAYGCreditCreationError({
  error,
  workspaceId,
}: {
  error: CreatePAYGCreditError;
  workspaceId: string;
}): HandleErrorResult {
  const { error_type, error_message } = error;
  switch (error_type) {
    case "already_exists":
      logger.info(
        { workspaceId },
        `[Credit PAYG] Credit already exists for this period`
      );
      return { action: "skip" };
    case "invalid_discount":
    case "unknown":
      // for eng-oncall: this is a P0 panic, do not hesitate to ping @pr or @jd to jump immediately on it
      logger.error(
        { workspaceId, error: error_message, panic: true },
        `[Credit PAYG] Failed to create PAYG credit for this period. Potentially blocking customer's automations`
      );
      statsDClient.increment("credits.top_up.error", 1, [
        `workspace_id:${workspaceId}`,
        "type:payg",
        "customer:enterprise",
      ]);
      return { action: "fail", error: new Error(error_message) };
    default:
      assertNever(error_type);
  }
}

async function createPAYGCreditForPeriod({
  auth,
  paygCapMicroUsd,
  discountPercent,
  periodStart,
  periodEnd,
}: {
  auth: Authenticator;
  paygCapMicroUsd: number;
  discountPercent: number;
  periodStart: Date;
  periodEnd: Date;
}): Promise<Result<CreditResource, CreatePAYGCreditError>> {
  if (discountPercent > MAX_DISCOUNT_PERCENT) {
    return new Err({
      error_type: "invalid_discount",
      error_message: `Discount cannot exceed ${MAX_DISCOUNT_PERCENT}% (would result in selling below cost)`,
    });
  }

  const existingCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    periodStart,
    periodEnd
  );

  if (existingCredit) {
    return new Err({
      error_type: "already_exists",
      error_message: "Credit already exists for this period",
    });
  }

  const credit = await CreditResource.makeNew(auth, {
    type: "payg",
    initialAmountMicroUsd: paygCapMicroUsd,
    consumedAmountMicroUsd: 0,
    discount: discountPercent,
    invoiceOrLineItemId: null,
  });

  const startResult = await credit.start(auth, {
    startDate: periodStart,
    expirationDate: periodEnd,
  });
  if (startResult.isErr()) {
    return new Err({
      error_type: "unknown",
      error_message: startResult.error.message,
    });
  }
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
  if (!config || config.paygCapMicroUsd === null) {
    return;
  }

  const nextPeriodStartDate = new Date(nextPeriodStartSeconds * 1000);
  const nextPeriodEndDate = new Date(nextPeriodEndSeconds * 1000);

  const result = await createPAYGCreditForPeriod({
    auth,
    paygCapMicroUsd: config.paygCapMicroUsd,
    discountPercent: config.defaultDiscountPercent,
    periodStart: nextPeriodStartDate,
    periodEnd: nextPeriodEndDate,
  });

  if (result.isErr()) {
    handlePAYGCreditCreationError({
      error: result.error,
      workspaceId: workspace.sId,
    });
    return;
  }
  logger.info(
    {
      workspaceId: workspace.sId,
      initialAmountMicroUsd: config.paygCapMicroUsd,
      periodStart: nextPeriodStartDate.toISOString(),
      periodEnd: nextPeriodEndDate.toISOString(),
    },
    "[Credit PAYG] Allocated new PAYG credit for billing cycle"
  );
  statsDClient.increment("credits.top_up.success", 1, [
    `workspace_id:${workspace.sId}`,
    "type:payg",
    "customer:enterprise",
  ]);
}

export async function isPAYGEnabled(auth: Authenticator): Promise<boolean> {
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config !== null && config.paygCapMicroUsd !== null;
}

export async function startOrResumeEnterprisePAYG({
  auth,
  stripeSubscription,
  paygCapMicroUsd,
}: {
  auth: Authenticator;
  stripeSubscription: Stripe.Subscription;
  paygCapMicroUsd: number;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  assert(
    isEnterpriseSubscription(stripeSubscription),
    "startOrResumeEnterprisePAYG called with non-enterprise subscription"
  );

  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config) {
    statsDClient.increment("credits.top_up.error", 1, [
      `workspace_id:${workspace.sId}`,
      "type:payg",
      "customer:enterprise",
    ]);
    return new Err(
      new Error(
        "Programmatic usage configuration must exist before enabling PAYG"
      )
    );
  }

  const updateResult = await config.updateConfiguration(auth, {
    paygCapMicroUsd,
  });
  if (updateResult.isErr()) {
    statsDClient.increment("credits.top_up.error", 1, [
      `workspace_id:${workspace.sId}`,
      "type:payg",
      "customer:enterprise",
    ]);
    return updateResult;
  }

  const currentPeriodStart = new Date(
    stripeSubscription.current_period_start * 1000
  );
  const currentPeriodEnd = new Date(
    stripeSubscription.current_period_end * 1000
  );

  const existingCredit = await CreditResource.fetchByTypeAndDates(
    auth,
    "payg",
    currentPeriodStart,
    currentPeriodEnd
  );

  if (existingCredit) {
    await existingCredit.updateInitialAmountMicroUsd(auth, paygCapMicroUsd);
  } else {
    const result = await createPAYGCreditForPeriod({
      auth,
      paygCapMicroUsd,
      discountPercent: config.defaultDiscountPercent,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
    });

    if (result.isErr()) {
      const handleResult = handlePAYGCreditCreationError({
        error: result.error,
        workspaceId: workspace.sId,
      });
      if (handleResult.action === "fail") {
        return new Err(handleResult.error);
      }
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
  }
  statsDClient.increment("credits.top_up.success", 1, [
    `workspace_id:${workspace.sId}`,
    "type:payg",
    "customer:enterprise",
  ]);
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
    const freezeResult = await paygCredit.freeze(auth);
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
      paygCapMicroUsd: null,
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

  if (paygCredit.consumedAmountMicroUsd === 0) {
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
      consumedAmountMicroUsd: paygCredit.consumedAmountMicroUsd,
      discountPercent,
      periodStart: previousPeriodStartDate.toISOString(),
      periodEnd: previousPeriodEndDate.toISOString(),
    },
    "[Credit PAYG] Creating arrears invoice"
  );

  const invoiceResult = await makeAndFinalizeCreditsPAYGInvoice({
    stripeSubscription,
    amountMicroUsd: paygCredit.consumedAmountMicroUsd,
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
