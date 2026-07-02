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

import {
  loadMigrationDeps,
  type MigrationDeps,
  migrateWorkspaceToBusiness,
} from "@app/lib/api/billing/migrate_to_business";
import { Authenticator } from "@app/lib/auth";
import { isProPlanPrefix } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";

async function migrateWorkspace(
  workspace: LightWorkspaceType,
  {
    deps,
    migrateNow,
    migrateNextHour,
    execute,
  }: {
    deps: MigrationDeps;
    migrateNow: boolean;
    migrateNextHour: boolean;
    execute: boolean;
  },
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const result = await migrateWorkspaceToBusiness(auth, {
    deps,
    migrateNow,
    migrateNextHour,
    execute,
  });
  if (result.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: result.error.message },
      "[migrate-business] Migration failed"
    );
    return;
  }
  const outcome = result.value;
  if (outcome.status === "skipped") {
    logger.info(
      { workspaceId: workspace.sId, reason: outcome.reason },
      "[migrate-business] Skipped"
    );
    return;
  }
  logger.info(
    {
      workspaceId: workspace.sId,
      migrationDate: outcome.migrationDate.toISOString(),
      metronomeContractId: outcome.metronomeContractId,
    },
    `[migrate-business] ${execute ? "Migrated" : "[DRY RUN] Would migrate"}: pending Business contract scheduled for the migration date`
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

    // Resolve the Business packages + plans once, reused across workspaces.
    const depsResult = await loadMigrationDeps({
      windowStart: windowStartDate,
      windowEnd: windowEndDate,
    });
    if (depsResult.isErr()) {
      throw depsResult.error;
    }
    const deps = depsResult.value;

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
              deps,
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
