import { checkWorkspaceFitsPlanLimits } from "@app/lib/api/plan_compatibility";
import {
  SwitchContractBodySchema,
  switchContract,
} from "@app/lib/api/poke/switch_contract";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import {
  ceilToHourISO,
  floorToHourISO,
  listMetronomePackages,
} from "@app/lib/metronome/client";
import {
  BUSINESS_EUR_PACKAGE_ALIAS,
  BUSINESS_GBP_PACKAGE_ALIAS,
  BUSINESS_USD_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";
import { PlanModel } from "@app/lib/models/plan";
import {
  CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE,
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  PRO_PLAN_LARGE_FILES_10SPACES_CODE,
  PRO_PLAN_LARGE_FILES_CODE,
  PRO_PLAN_PLUS_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import {
  ensureStripeCustomerDefaultPaymentMethod,
  getCustomerId,
  getStripeSubscription,
  markSubscriptionForMigrationRefund,
  scheduleSubscriptionCancellation,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import type { PlanType } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// One-off free AWU credit granted per workspace member at migration time. The
// committed-credit conversion ($1 = 100 AWU) and this bonus are applied by the
// `contract.start` webhook at activation, so the amounts reflect the
// workspace's state at migration time rather than at migration-scheduling time.
const FREE_MIGRATION_AWU_CREDITS_PER_USER = 2000;

// Legacy Pro plan codes that always migrate to the legacy-large Business plan
// (their seats/features exceed the standard Business plan), regardless of the
// workspace's current usage.
const FORCE_LEGACY_LARGE_PLAN_CODES = new Set<string>([
  PRO_PLAN_SEAT_39_CODE,
  PRO_PLAN_LARGE_FILES_CODE,
  PRO_PLAN_LARGE_FILES_10SPACES_CODE,
  PRO_PLAN_PLUS_SEAT_29_CODE,
]);

// Default rollout window [start, end) for the legacy Pro → Business migration.
// The batch script accepts overrides; the user-facing resume flow uses these.
export const MIGRATION_WINDOW_START_ISO = "2026-07-23";
export const MIGRATION_WINDOW_END_ISO = "2026-08-23";

// Business package alias for a given Stripe currency. Returns null for
// currencies we do not have a Business package for (the workspace is skipped).
function businessPackageAliasForCurrency(currency: string): string | null {
  switch (currency.toUpperCase()) {
    case "USD":
      return BUSINESS_USD_PACKAGE_ALIAS;
    case "EUR":
      return BUSINESS_EUR_PACKAGE_ALIAS;
    case "GBP":
      return BUSINESS_GBP_PACKAGE_ALIAS;
    default:
      return null;
  }
}

// Add `n` calendar months to `date` (UTC), clamping the day to the last day of
// the target month (e.g. Jan 31 + 1 month -> Feb 28/29).
function addMonthsUTC(date: Date, n: number): Date {
  const firstOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1)
  );
  const ty = firstOfTargetMonth.getUTCFullYear();
  const tm = firstOfTargetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      ty,
      tm,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
}

// Roll the monthly renewal boundary forward by whole months until it lands in
// the rollout window [windowStart, windowEnd). Returns null when no renewal
// boundary falls inside the window.
export function migrationDateInWindow(
  currentPeriodEnd: Date,
  windowStart: Date,
  windowEnd: Date
): Date | null {
  let d = currentPeriodEnd;
  // Guard against an unexpectedly far-future boundary (e.g. mis-detected yearly).
  if (d.getTime() >= windowEnd.getTime()) {
    return null;
  }
  // Advance one month at a time until we reach the window.
  let guard = 0;
  while (d.getTime() < windowStart.getTime() && guard < 24) {
    d = addMonthsUTC(d, 1);
    guard += 1;
  }
  if (
    d.getTime() >= windowStart.getTime() &&
    d.getTime() < windowEnd.getTime()
  ) {
    return d;
  }
  return null;
}

/**
 * Resolve the migration instant for a workspace inside the rollout window.
 *  - monthly: the workspace's own monthly renewal boundary that lands in the
 *    window (staggered per workspace), floored to the hour;
 *  - yearly: fixed at the window START date (there is no monthly renewal in the
 *    window), at the subscription's billing-anchor hour (== `currentPeriodEnd`'s
 *    hour) so yearly workspaces spread across the day rather than all migrating
 *    at the same instant.
 *
 * Returns null for a monthly subscription with no renewal boundary in the window.
 */
export function resolveMigrationDate({
  billingPeriod,
  currentPeriodEndMs,
  windowStart,
  windowEnd,
}: {
  billingPeriod: "monthly" | "yearly";
  currentPeriodEndMs: number;
  windowStart: Date;
  windowEnd: Date;
}): Date | null {
  if (billingPeriod === "yearly") {
    const anchorHour = new Date(currentPeriodEndMs).getUTCHours();
    return new Date(
      Date.UTC(
        windowStart.getUTCFullYear(),
        windowStart.getUTCMonth(),
        windowStart.getUTCDate(),
        anchorHour
      )
    );
  }
  const boundary = migrationDateInWindow(
    new Date(currentPeriodEndMs),
    windowStart,
    windowEnd
  );
  return boundary ? new Date(floorToHourISO(boundary)) : null;
}

/**
 * Prepaid days a yearly subscription still has left at the migration date
 * (`currentPeriodEnd − migrationDate`, rounded up, floored at 0). Cutting a
 * yearly sub over at the migration date leaves this many prepaid days unused;
 * Stripe does not auto-refund them. We compute + log this for now; the refund
 * mechanism is TBD.
 */
export function remainingPrepaidDays(
  currentPeriodEndMs: number,
  migrationDate: Date
): number {
  return Math.max(
    0,
    Math.ceil((currentPeriodEndMs - migrationDate.getTime()) / ONE_DAY_MS)
  );
}

// Shared inputs resolved once (packages + Business plans + window) and reused
// across workspaces by the batch script; the resume flow loads them per call.
export type MigrationDeps = {
  packageIdByAlias: Map<string, string>;
  businessPlan: PlanType;
  businessLegacyLargePlan: PlanType;
  windowStart: Date;
  windowEnd: Date;
};

export async function loadMigrationDeps({
  windowStart,
  windowEnd,
}: {
  windowStart?: Date;
  windowEnd?: Date;
} = {}): Promise<Result<MigrationDeps, Error>> {
  const packagesResult = await listMetronomePackages();
  if (packagesResult.isErr()) {
    return new Err(
      new Error(
        `Failed to list Metronome packages: ${packagesResult.error.message}`
      )
    );
  }
  const packageIdByAlias = new Map<string, string>();
  for (const pkg of packagesResult.value) {
    for (const alias of pkg.aliases) {
      packageIdByAlias.set(alias, pkg.id);
    }
  }

  const fetchPlan = async (code: string): Promise<PlanType | null> => {
    const planModel = await PlanModel.findOne({ where: { code } });
    return planModel ? renderPlanFromModel({ plan: planModel }) : null;
  };
  const businessPlan = await fetchPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE);
  const businessLegacyLargePlan = await fetchPlan(
    CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE
  );
  if (!businessPlan || !businessLegacyLargePlan) {
    return new Err(
      new Error(
        "Business plan(s) not found in the database " +
          `(${CREDIT_PRICED_BUSINESS_PLAN_CODE}, ` +
          `${CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE}).`
      )
    );
  }

  return new Ok({
    packageIdByAlias,
    businessPlan,
    businessLegacyLargePlan,
    windowStart:
      windowStart ?? new Date(`${MIGRATION_WINDOW_START_ISO}T00:00:00.000Z`),
    windowEnd:
      windowEnd ?? new Date(`${MIGRATION_WINDOW_END_ISO}T00:00:00.000Z`),
  });
}

type MigrateToBusinessOutcome =
  // Migration was staged (or would be, in dry-run): a pending Business contract
  // is scheduled for `migrationDate`. For yearly subs, `remainingProrationDays`
  // is the unused prepaid time cut off at the migration date (refund TBD).
  | {
      status: "migrated";
      migrationDate: Date;
      metronomeContractId: string | null;
      billingPeriod: "monthly" | "yearly";
      remainingProrationDays: number | null;
    }
  // The workspace was intentionally not migrated (not eligible, no renewal in
  // window, exceeds limits, already pending, ...). `reason` documents why.
  | { status: "skipped"; reason: string }
  // An already-cancelled YEARLY subscription had its cancellation pulled in to
  // the cutover date (no Business contract — the customer opted out). The unused
  // prepaid time is refunded by the `subscription.deleted` webhook when it ends.
  | { status: "cancellation_capped"; cancelDate: Date };

/**
 * Stage the legacy Pro → Business migration for a SINGLE workspace: pick the
 * Business plan that fits, resolve the target migration date, ensure the Stripe
 * customer default payment method, and `switchContract` to a future-dated
 * Business contract (pending subscription + scheduled Stripe cancellation).
 *
 * Extracted from the batch migration script so the same path can be re-run to
 * RESUME a migration a user had cancelled (see `resumeWorkspaceMigration`).
 *
 * Returns a domain `Result`: `Ok` with a `migrated`/`skipped` outcome for the
 * expected cases, `Err` only on an actual failure (Stripe/Metronome/switch).
 * `execute:false` performs every read + eligibility check but does not mutate.
 */
export async function migrateWorkspaceToBusiness(
  auth: Authenticator,
  {
    deps,
    migrateNow = false,
    migrateNextHour = false,
    execute,
    skipCancellingSubscription = true,
  }: {
    deps: MigrationDeps;
    migrateNow?: boolean;
    migrateNextHour?: boolean;
    execute: boolean;
    // Skip workspaces whose Stripe subscription is already scheduled to cancel
    // (a leaving customer) — the default for the batch migration. `resume` sets
    // this to false: it deliberately re-migrates a subscription the user had
    // cancelled (the Stripe cancellation is rescheduled to the migration date by
    // the switch).
    skipCancellingSubscription?: boolean;
  }
): Promise<Result<MigrateToBusinessOutcome, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscriptionResource();
  if (!subscription?.stripeSubscriptionId) {
    return new Ok({
      status: "skipped",
      reason: "no active Stripe-billed subscription",
    });
  }

  // `switchContract` requires Metronome billing; skip workspaces still on the
  // `legacy_billing` feature flag rather than letting `switchContract` throw
  // further down. (Every caller here has a live `stripeSubscriptionId`, so
  // `isMetronomeOnlyBilled` is never relevant to this check.)
  if (!(await isMetronomeBillingEnabled(auth))) {
    return new Ok({
      status: "skipped",
      reason: "workspace is on legacy (non-Metronome) billing",
    });
  }

  // Don't re-schedule a workspace that already has a pending Metronome contract.
  const existingPending =
    await SubscriptionResource.fetchPendingByWorkspaceModelId(workspace.id);
  if (existingPending) {
    return new Ok({
      status: "skipped",
      reason: "a pending contract already exists",
    });
  }

  const pricing = await subscription.getPerSeatPricing();
  if (!pricing || pricing.currentPeriodEndMs === null) {
    // `getPerSeatPricing` returns null for several reasons. Inspect the Stripe
    // subscription's seat quantity to classify: a 0-quantity subscription is an
    // empty workspace (benign skip). Anything else — a non-per-seat price
    // (metered / enterprise MAU), missing currency option, or a subscription we
    // can't read — is unexpected for a Pro per-seat workspace and is surfaced as
    // an error rather than a silent skip.
    const stripeSub = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    const seatQuantity = stripeSub?.items?.data[0]?.quantity ?? null;
    if (seatQuantity === 0) {
      return new Ok({
        status: "skipped",
        reason: "workspace has no active seats",
      });
    }
    return new Err(
      new Error(
        "Could not resolve per-seat Stripe pricing for subscription " +
          `${subscription.stripeSubscriptionId} (seat quantity ` +
          `${seatQuantity ?? "unknown"}) — unexpected price shape ` +
          "(e.g. metered / enterprise MAU or missing currency option)."
      )
    );
  }
  const { billingPeriod } = pricing;
  const currentPeriodEndMs = pricing.currentPeriodEndMs;

  // Plan-compatibility: migrate onto the standard Business plan when the
  // workspace fits it (seats, spaces, data sources). Otherwise fall back to the
  // legacy-large Business plan, whose limits fit any PRO_* workspace, so the
  // move never downgrades the workspace below its current usage.
  //
  // A few legacy Pro plans (see FORCE_LEGACY_LARGE_PLAN_CODES) always migrate to
  // the legacy-large Business plan regardless of current usage.
  const currentPlanCode = subscription.getPlan().code;
  let targetPlan = deps.businessPlan;
  // Human-readable explanation of the plan choice, surfaced in the log below.
  let planChoiceReason: string;
  if (FORCE_LEGACY_LARGE_PLAN_CODES.has(currentPlanCode)) {
    targetPlan = deps.businessLegacyLargePlan;
    planChoiceReason = `${currentPlanCode} always uses legacy-large Business`;
  } else {
    const standardFit = await checkWorkspaceFitsPlanLimits(
      auth,
      deps.businessPlan
    );
    if (standardFit.fits) {
      planChoiceReason = "workspace fits standard Business limits";
    } else {
      const largeFit = await checkWorkspaceFitsPlanLimits(
        auth,
        deps.businessLegacyLargePlan
      );
      if (!largeFit.fits) {
        return new Ok({
          status: "skipped",
          reason:
            "workspace exceeds even the legacy-large Business plan limits " +
            `(${largeFit.violations.join(", ")})`,
        });
      }
      targetPlan = deps.businessLegacyLargePlan;
      planChoiceReason = `standard Business limits exceeded (${standardFit.violations.join(
        ", "
      )})`;
    }
  }
  logger.info(
    { workspaceId: workspace.sId, planCode: targetPlan.code, planChoiceReason },
    `[migrate-business] Plan selected: ${targetPlan.code} — ${planChoiceReason}`
  );

  const packageAlias = businessPackageAliasForCurrency(pricing.seatCurrency);
  if (!packageAlias) {
    return new Ok({
      status: "skipped",
      reason: `no Business package for currency ${pricing.seatCurrency}`,
    });
  }
  const metronomePackageId = deps.packageIdByAlias.get(packageAlias);
  if (!metronomePackageId) {
    return new Err(
      new Error(`Business package "${packageAlias}" not found in Metronome.`)
    );
  }

  // Migration date: `--now`/`--next-hour` are testing shortcuts (bypass the
  // window); otherwise monthly uses the workspace's own renewal boundary in the
  // window, yearly is fixed at the window start (at the anchor hour).
  let migrationDate: Date;
  if (migrateNow) {
    migrationDate = new Date(floorToHourISO(new Date()));
  } else if (migrateNextHour) {
    migrationDate = new Date(ceilToHourISO(new Date()));
  } else {
    const resolved = resolveMigrationDate({
      billingPeriod,
      currentPeriodEndMs,
      windowStart: deps.windowStart,
      windowEnd: deps.windowEnd,
    });
    if (!resolved) {
      return new Ok({
        status: "skipped",
        reason: "no renewal boundary falls inside the rollout window",
      });
    }
    migrationDate = resolved;
  }

  // Yearly subs are cut over mid-year at the migration date; the unused prepaid
  // time is refunded when the Stripe sub ends (see the refund marker below and
  // the `subscription.deleted` webhook). Tracked here for logging.
  const remainingProrationDays =
    billingPeriod === "yearly"
      ? remainingPrepaidDays(currentPeriodEndMs, migrationDate)
      : null;

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    return new Err(
      new Error(
        `Stripe subscription ${subscription.stripeSubscriptionId} not found.`
      )
    );
  }

  const isCancelling =
    stripeSubscription.cancel_at_period_end ||
    stripeSubscription.cancel_at !== null ||
    stripeSubscription.status === "canceled";
  if (isCancelling && skipCancellingSubscription) {
    // Monthly cancelling subs are left alone — they churn at their own period
    // end (a leaving customer, don't migrate to Business).
    if (billingPeriod !== "yearly") {
      return new Ok({
        status: "skipped",
        reason: "subscription is already scheduled to cancel",
      });
    }
    // Yearly cancelling subs: all yearly plans end by the cutover, so pull the
    // cancellation in to the cutover date (window start @ anchor hour) when it
    // would otherwise end later. No Business contract (they opted out); the
    // unused prepaid time is refunded when it ends (webhook). Never extend a sub
    // already ending on/before the cutover.
    const capDate = resolveMigrationDate({
      billingPeriod: "yearly",
      currentPeriodEndMs,
      windowStart: deps.windowStart,
      windowEnd: deps.windowEnd,
    });
    if (!capDate) {
      return new Ok({
        status: "skipped",
        reason: "could not resolve the yearly cutover date",
      });
    }
    const currentEndMs =
      (stripeSubscription.cancel_at ?? stripeSubscription.current_period_end) *
      1000;
    if (currentEndMs <= capDate.getTime()) {
      return new Ok({
        status: "skipped",
        reason: "cancelled subscription already ends on or before the cutover",
      });
    }
    if (execute) {
      try {
        await scheduleSubscriptionCancellation({
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          cancelAt: capDate,
        });
      } catch (err) {
        return new Err(normalizeError(err));
      }
      const markResult = await markSubscriptionForMigrationRefund({
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      });
      if (markResult.isErr()) {
        return new Err(markResult.error);
      }
      await subscription.markAsCanceled({ endDate: capDate });
    }
    logger.info(
      {
        workspaceId: workspace.sId,
        cancelDate: capDate.toISOString(),
        remainingProrationDays: remainingPrepaidDays(
          currentPeriodEndMs,
          capDate
        ),
      },
      "[migrate-business] Capped yearly cancellation at the cutover (refund on end)"
    );
    return new Ok({ status: "cancellation_capped", cancelDate: capDate });
  }

  const stripeCustomerId = getCustomerId(stripeSubscription);

  const body = SwitchContractBodySchema.parse({
    planCode: targetPlan.code,
    metronomePackageId,
    startingAt: migrationDate.toISOString(),
    stripeCustomerId,
    stripeCollectionMethod: "charge_automatically",
    // Legacy members carry no explicit seat type ("none"); force them all onto the
    // `pro` paid seat on the new Business contract — even if plan is yearly (let the
    // user decide later if they want to continue on yearly)
    promoteNoneSeatsTo: "pro",
    // Stamp the credit-migration marker; the `contract.start` webhook converts
    // convertible legacy credits to AWU and grants the per-member bonus THEN.
    legacyMigrationFreeAwuCreditsPerUser: FREE_MIGRATION_AWU_CREDITS_PER_USER,
  });

  if (!execute) {
    return new Ok({
      status: "migrated",
      migrationDate,
      metronomeContractId: null,
      billingPeriod,
      remainingProrationDays,
    });
  }

  // Metronome bills the Stripe customer's default payment method. A paid Stripe
  // subscription may keep its card only on the subscription, not as the customer
  // default — set it so Metronome invoices don't fail after the switch.
  const paymentMethodResult = await ensureStripeCustomerDefaultPaymentMethod({
    stripeCustomerId,
    stripeSubscription,
    workspaceId: workspace.sId,
  });
  if (paymentMethodResult.isErr()) {
    return new Err(
      new Error(
        "Failed to ensure Stripe customer default payment method: " +
          paymentMethodResult.error.error_message
      )
    );
  }
  if (!paymentMethodResult.value.defaultPaymentMethodId) {
    logger.warn(
      { workspaceId: workspace.sId },
      "[migrate-business] No default payment method found — Metronome billing may fail"
    );
  }

  const result = await switchContract({ auth, body });
  if (result.isErr()) {
    return new Err(normalizeError(result.error));
  }

  // Yearly subs are cut over mid-year: mark the Stripe subscription so the
  // `subscription.deleted` webhook refunds the unused prepaid days when it ends
  // at the migration date. Best-effort — the migration already succeeded.
  if (billingPeriod === "yearly" && subscription.stripeSubscriptionId) {
    const markResult = await markSubscriptionForMigrationRefund({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });
    if (markResult.isErr()) {
      logger.warn(
        { workspaceId: workspace.sId, err: markResult.error.message },
        "[migrate-business] Failed to mark yearly sub for migration refund; refund will not fire on end"
      );
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      planCode: targetPlan.code,
      billingPeriod,
      metronomeContractId: result.value.metronomeContractId,
      migrationDate: migrationDate.toISOString(),
      // For yearly: prepaid days cut off at the migration date, refunded on end.
      remainingProrationDays,
    },
    "[migrate-business] Staged pending Business contract for the migration date"
  );

  return new Ok({
    status: "migrated",
    migrationDate,
    metronomeContractId: result.value.metronomeContractId,
    billingPeriod,
    remainingProrationDays,
  });
}
