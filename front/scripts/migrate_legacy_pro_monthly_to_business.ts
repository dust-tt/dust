/**
 * Migrate legacy monthly Pro workspaces (any PRO_* plan) to a new credit-priced
 * Business plan (CP_BUSINESS_PLAN, or the legacy-large variant when the workspace
 * exceeds the standard Business limits).
 *
 * For every active, Stripe-billed, MONTHLY subscription on a legacy PRO_* plan
 * this script:
 *   1. Computes the migration date = the workspace's own monthly renewal
 *      boundary that falls inside the rollout window [windowStart, windowEnd),
 *      floored to the hour. Each monthly subscription has exactly one renewal
 *      boundary per month, so the migration is naturally staggered across the
 *      window.
 *   2. Picks the target plan: the standard Business plan when the workspace fits
 *      its limits, otherwise the legacy-large Business plan (whose limits fit any
 *      PRO_* workspace), so the move never downgrades the workspace.
 *   3. Provisions a PENDING Metronome contract on the Business package
 *      (business-usd / business-eur, chosen from the Stripe currency), starting
 *      at the migration date, via `switchContract`. `switchContract` also
 *      creates the `created_backend_only` pending subscription and schedules the
 *      Stripe subscription to cancel at the same moment (no double-billing). The
 *      legacy subscription is ended by the `contract.start` webhook at
 *      activation — the script does NOT set its endDate / requestCancelAt, which
 *      would surface a misleading "subscription ends" banner + restore action.
 *
 * Yearly subscriptions are intentionally skipped (handled separately).
 *
 * Dry run by default. Run with:
 *   npx tsx scripts/migrate_legacy_pro_monthly_to_business.ts \
 *     [--windowStart 2026-07-23] [--windowEnd 2026-08-23] [--now] [--next-hour] \
 *     [--workspaceId <sId>] [--concurrency 4] [--execute]
 *
 * Testing shortcuts (bypass the rollout window; useful with a single
 * --workspaceId): `--now` migrates immediately (current hour, backdated —
 * exercises the in-place swap path); `--next-hour` migrates at the next hour
 * boundary (future-dated — exercises the pending-subscription path, like a real
 * rollout-window migration). `--now` takes precedence if both are set.
 */

import { checkWorkspaceFitsPlanLimits } from "@app/lib/api/plan_compatibility";
import {
  SwitchContractBodySchema,
  switchContract,
} from "@app/lib/api/poke/switch_contract";
import { Authenticator } from "@app/lib/auth";
import {
  ceilToHourISO,
  floorToHourISO,
  listMetronomePackages,
} from "@app/lib/metronome/client";
import {
  BUSINESS_EUR_PACKAGE_ALIAS,
  BUSINESS_USD_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";
import { PlanModel } from "@app/lib/models/plan";
import {
  CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE,
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  isProPlanPrefix,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import {
  ensureStripeCustomerDefaultPaymentMethod,
  getCustomerId,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { PlanType } from "@app/types/plan";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";

// One-off free AWU credit granted per workspace member at migration time. The
// committed-credit conversion ($1 = 100 AWU) and this bonus are applied by the
// `contract.start` webhook at activation, so the amounts reflect the
// workspace's state at migration time rather than at script-run time.
const FREE_MIGRATION_AWU_CREDITS_PER_USER = 2000;

// Business package alias for a given Stripe currency. Returns null for currencies
// we do not have a Business package for (the workspace is then skipped).
function businessPackageAliasForCurrency(currency: string): string | null {
  switch (currency.toUpperCase()) {
    case "USD":
      return BUSINESS_USD_PACKAGE_ALIAS;
    case "EUR":
      return BUSINESS_EUR_PACKAGE_ALIAS;
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
function migrationDateInWindow(
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

async function migrateWorkspace(
  workspace: LightWorkspaceType,
  {
    packageIdByAlias,
    businessPlan,
    businessLegacyLargePlan,
    windowStart,
    windowEnd,
    migrateNow,
    migrateNextHour,
    execute,
  }: {
    packageIdByAlias: Map<string, string>;
    businessPlan: PlanType;
    businessLegacyLargePlan: PlanType;
    windowStart: Date;
    windowEnd: Date;
    migrateNow: boolean;
    migrateNextHour: boolean;
    execute: boolean;
  },
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const subscription = auth.subscriptionResource();
  if (!subscription || !subscription.stripeSubscriptionId) {
    logger.info(
      { workspaceId: workspace.sId },
      "[migrate-business] No active Stripe-billed subscription, skipping"
    );
    return;
  }

  // Don't re-schedule a workspace that already has a pending Metronome contract.
  const existingPending =
    await SubscriptionResource.fetchPendingByWorkspaceModelId(workspace.id);
  if (existingPending) {
    logger.info(
      { workspaceId: workspace.sId },
      "[migrate-business] Pending contract already exists, skipping"
    );
    return;
  }

  const pricing = await subscription.getPerSeatPricing();
  if (!pricing || pricing.currentPeriodEndMs === null) {
    logger.warn(
      { workspaceId: workspace.sId },
      "[migrate-business] Could not resolve per-seat Stripe pricing, skipping"
    );
    return;
  }

  if (pricing.billingPeriod !== "monthly") {
    logger.info(
      { workspaceId: workspace.sId, billingPeriod: pricing.billingPeriod },
      "[migrate-business] Not a monthly subscription, skipping (handled separately)"
    );
    return;
  }

  // Plan-compatibility check: migrate onto the standard Business plan when the
  // workspace fits it (seats, spaces, data sources). Otherwise fall back to the
  // legacy-large Business plan, whose limits fit any PRO_* workspace, so the move
  // never downgrades the workspace below its current usage.
  const standardFit = await checkWorkspaceFitsPlanLimits(auth, businessPlan);
  let targetPlan = businessPlan;
  if (!standardFit.fits) {
    const largeFit = await checkWorkspaceFitsPlanLimits(
      auth,
      businessLegacyLargePlan
    );
    if (!largeFit.fits) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          standardViolations: standardFit.violations,
          legacyLargeViolations: largeFit.violations,
        },
        "[migrate-business] Workspace exceeds even the legacy-large Business plan, skipping"
      );
      return;
    }
    targetPlan = businessLegacyLargePlan;
    logger.info(
      { workspaceId: workspace.sId, violations: standardFit.violations },
      "[migrate-business] Workspace exceeds standard Business limits, using legacy-large plan"
    );
  }

  const packageAlias = businessPackageAliasForCurrency(pricing.seatCurrency);
  if (!packageAlias) {
    logger.warn(
      { workspaceId: workspace.sId, currency: pricing.seatCurrency },
      "[migrate-business] No Business package for currency, skipping"
    );
    return;
  }
  const metronomePackageId = packageIdByAlias.get(packageAlias);
  if (!metronomePackageId) {
    logger.error(
      { workspaceId: workspace.sId, packageAlias },
      "[migrate-business] Business package not found in Metronome, skipping"
    );
    return;
  }

  // Testing shortcuts (both bypass the rollout window):
  //  - `--now`: current hour boundary (floor). The contract is backdated so
  //    Metronome fires `contract.start` right away; with no pending row the
  //    handler swaps/creates the subscription in place.
  //  - `--next-hour`: next hour boundary (ceil), i.e. future-dated — exercises
  //    the pending-subscription path (created_backend_only → activated at start),
  //    same as a real rollout-window migration but without waiting.
  // Otherwise use the workspace's own renewal boundary within the rollout window.
  let migrationDate: Date;
  if (migrateNow) {
    migrationDate = new Date(floorToHourISO(new Date()));
  } else if (migrateNextHour) {
    migrationDate = new Date(ceilToHourISO(new Date()));
  } else {
    const windowBoundary = migrationDateInWindow(
      new Date(pricing.currentPeriodEndMs),
      windowStart,
      windowEnd
    );
    if (!windowBoundary) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          currentPeriodEnd: new Date(pricing.currentPeriodEndMs).toISOString(),
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
        },
        "[migrate-business] No renewal boundary in rollout window, skipping"
      );
      return;
    }
    migrationDate = new Date(floorToHourISO(windowBoundary));
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    logger.error(
      {
        workspaceId: workspace.sId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      "[migrate-business] Stripe subscription not found, skipping"
    );
    return;
  }
  const stripeCustomerId = getCustomerId(stripeSubscription);

  const body = SwitchContractBodySchema.parse({
    planCode: targetPlan.code,
    metronomePackageId,
    startingAt: migrationDate.toISOString(),
    stripeCustomerId,
    stripeCollectionMethod: "charge_automatically",
    // Legacy members carry no explicit seat type ("none"); promote them all to a
    // paid Pro seat on the new Business contract (scheduled at the switch moment).
    // This branch only handles monthly subscriptions, hence "pro" (not "pro_yearly").
    promoteNoneSeatsTo: "pro",
    // Stamp the credit-migration marker on the contract. The script itself does
    // NOT grant any credit — at `contract.start` the webhook converts the
    // workspace's convertible legacy credits (committed + poke-granted free) to
    // AWU and grants this many free AWU per member, computed THEN so the amounts
    // reflect the workspace's state at activation.
    legacyMigrationFreeAwuCreditsPerUser: FREE_MIGRATION_AWU_CREDITS_PER_USER,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      planCode: targetPlan.code,
      currency: pricing.seatCurrency,
      packageAlias,
      metronomePackageId,
      currentPeriodEnd: new Date(pricing.currentPeriodEndMs).toISOString(),
      migrationDate: migrationDate.toISOString(),
    },
    `[migrate-business] ${execute ? "Migrating" : "[DRY RUN] Would migrate"} to Business`
  );

  if (!execute) {
    return;
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
    logger.error(
      {
        workspaceId: workspace.sId,
        error: paymentMethodResult.error.error_message,
      },
      "[migrate-business] Failed to ensure Stripe default payment method, skipping"
    );
    return;
  }
  if (paymentMethodResult.value.updated) {
    logger.info(
      {
        workspaceId: workspace.sId,
        defaultPaymentMethodId:
          paymentMethodResult.value.defaultPaymentMethodId,
      },
      "[migrate-business] Set Stripe customer default payment method"
    );
  } else if (!paymentMethodResult.value.defaultPaymentMethodId) {
    logger.warn(
      { workspaceId: workspace.sId },
      "[migrate-business] No default payment method found — Metronome billing may fail"
    );
  }

  const result = await switchContract({ auth, body });
  if (result.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        kind: result.error.kind,
        error: result.error.message,
      },
      "[migrate-business] switchContract failed"
    );
    return;
  }

  // NOTE: we intentionally do NOT mark the legacy subscription as canceled /
  // set its endDate here. That would set `requestCancelAt`, which the UI reads
  // as a scheduled cancellation — showing a "your subscription ends" banner and
  // a reactivate/restore action that would undo the migration. switchContract
  // has already scheduled the Stripe cancellation and staged the pending
  // Metronome subscription; the `contract.start` webhook ends the legacy
  // subscription (and applies the credit conversion + bonus) at activation.
  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeContractId: result.value.metronomeContractId,
      migrationDate: migrationDate.toISOString(),
    },
    "[migrate-business] Migrated: pending Business contract scheduled for the migration date"
  );
}

makeScript(
  {
    windowStart: {
      type: "string" as const,
      description: "Rollout window start (inclusive), ISO date",
      default: "2026-07-23",
    },
    windowEnd: {
      type: "string" as const,
      description: "Rollout window end (exclusive), ISO date",
      default: "2026-08-23",
    },
    now: {
      type: "boolean" as const,
      description:
        "Migrate immediately (current hour, backdated) instead of the workspace's billing-date window boundary",
      default: false,
    },
    nextHour: {
      type: "boolean" as const,
      description:
        "Migrate at the next hour boundary (future-dated) to exercise the pending-subscription path; ignored when --now is set",
      default: false,
    },
    workspaceId: {
      type: "string" as const,
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
    concurrency: {
      type: "number" as const,
      description: "Number of workspaces to process in parallel",
      default: 4,
    },
  },
  async (
    {
      windowStart,
      windowEnd,
      now,
      nextHour,
      workspaceId,
      concurrency,
      execute,
    },
    logger
  ) => {
    const windowStartDate = new Date(`${windowStart}T00:00:00.000Z`);
    const windowEndDate = new Date(`${windowEnd}T00:00:00.000Z`);
    if (
      Number.isNaN(windowStartDate.getTime()) ||
      Number.isNaN(windowEndDate.getTime()) ||
      windowStartDate.getTime() >= windowEndDate.getTime()
    ) {
      throw new Error(
        `Invalid rollout window: ${windowStart} .. ${windowEnd} (start must be a valid date before end)`
      );
    }

    // Resolve the Business package ids once (USD + EUR).
    const packagesResult = await listMetronomePackages();
    if (packagesResult.isErr()) {
      throw new Error(
        `Failed to list Metronome packages: ${packagesResult.error.message}`
      );
    }
    const packageIdByAlias = new Map<string, string>();
    for (const pkg of packagesResult.value) {
      for (const alias of pkg.aliases) {
        packageIdByAlias.set(alias, pkg.id);
      }
    }

    // The target Business plans — their live limits are checked against each
    // workspace to pick the standard plan or the legacy-large fallback.
    const fetchPlan = async (code: string): Promise<PlanType> => {
      const planModel = await PlanModel.findOne({ where: { code } });
      if (!planModel) {
        throw new Error(`Plan ${code} not found in the database.`);
      }
      return renderPlanFromModel({ plan: planModel });
    };
    const businessPlan = await fetchPlan(CREDIT_PRICED_BUSINESS_PLAN_CODE);
    const businessLegacyLargePlan = await fetchPlan(
      CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE
    );

    // Fetch the legacy Pro subscriptions (any PRO_* plan), then resolve their
    // workspaces so we only touch (and only hit Stripe for) legacy Pro workspaces.
    const allActive =
      await SubscriptionResource.internalListAllActiveNoFreeTestPlan();
    const subscriptions = allActive.filter(
      (s) => isProPlanPrefix(s.getPlan().code) && !!s.stripeSubscriptionId
    );

    const workspaceModelIds = [
      ...new Set(subscriptions.map((s) => s.workspaceId)),
    ];
    const workspaceResources =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    let workspaces = workspaceResources.map((w) =>
      renderLightWorkspaceType({ workspace: w })
    );
    if (workspaceId) {
      workspaces = workspaces.filter((w) => w.sId === workspaceId);
    }

    logger.info(
      {
        windowStart: windowStartDate.toISOString(),
        windowEnd: windowEndDate.toISOString(),
        candidates: workspaces.length,
      },
      `[migrate-business] ${execute ? "Executing" : "[DRY RUN]"} migration over ${workspaces.length} candidate workspace(s)`
    );

    await concurrentExecutor(
      workspaces,
      async (workspace) => {
        try {
          await migrateWorkspace(
            workspace,
            {
              packageIdByAlias,
              businessPlan,
              businessLegacyLargePlan,
              windowStart: windowStartDate,
              windowEnd: windowEndDate,
              migrateNow: now,
              migrateNextHour: nextHour,
              execute,
            },
            logger
          );
        } catch (err) {
          logger.error(
            { workspaceId: workspace.sId, error: normalizeError(err).message },
            "[migrate-business] Unexpected error while migrating workspace"
          );
        }
      },
      { concurrency }
    );
  }
);
