/**
 * Sync consumed credit/commit amounts between our DB and Metronome.
 *
 * For each workspace with a Metronome contract:
 * - Fetches every credit in DB that has a metronomeCreditId.
 * - Retrieves the corresponding credit (type="free") or commit (type="committed")
 *   from Metronome.
 * - Compares our DB consumedAmountMicroUsd against the consumed amount reflected
 *   in Metronome's balance (initialAmount - metronomeBalance).
 * - If Metronome has consumed LESS than DB, adds a manual ledger entry on Metronome
 *   to bring it in sync.
 *
 * Idempotent: repeated runs will detect that the gap has already been closed and
 * will skip without adding duplicate ledger entries.
 *
 * Run with: npx tsx scripts/sync_metronome_credit_consumption.ts [--execute] [--workspaceId <sId>] [--type free|committed|all]
 */

import { Authenticator } from "@app/lib/auth";
import {
  deductMetronomeCreditBalance,
  getMetronomeCommit,
  getMetronomeCredit,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

type SyncType = "free" | "committed" | "all";

// Skip deductions smaller than 1 cent — sub-cent drift isn't worth a ledger
// entry on Metronome.
const DEDUCTION_THRESHOLD_MICRO_USD = 10_000;

async function syncCreditsOfType(
  workspace: LightWorkspaceType,
  type: "free" | "committed",
  metronomeCustomerId: string,
  metronomeContractId: string | null,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const allCredits = await CreditResource.listAll(auth);
  // Skip expired credits: they're immutable history, and an expired row may
  // share a metronomeCreditId with the currently-active row (the old
  // linkMetronomeRecurringCreditToCredit linked to whatever recurring credit
  // was active at link time), which would make the comparison meaningless.
  const now = new Date();
  const credits = allCredits.filter(
    (c) =>
      c.type === type &&
      c.metronomeCreditId !== null &&
      (!c.expirationDate || c.expirationDate > now)
  );

  const metronomeItem = type === "free" ? "credit" : "commit";

  for (const credit of credits) {
    const metronomeCreditId = credit.metronomeCreditId!;

    // Fetch the entry from Metronome (include_balance=true is required to get the balance field).
    const metronomeResult =
      type === "free"
        ? await getMetronomeCredit({
            metronomeCustomerId,
            creditId: metronomeCreditId,
            includeBalance: true,
          })
        : await getMetronomeCommit({
            metronomeCustomerId,
            commitId: metronomeCreditId,
            includeBalance: true,
          });

    if (metronomeResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          error: metronomeResult.error.message,
        },
        `[Sync] Failed to fetch ${metronomeItem} from Metronome`
      );
      continue;
    }

    const metronomeEntry = metronomeResult.value;
    if (!metronomeEntry) {
      logger.warn(
        { workspaceId: workspace.sId, creditId: credit.id, metronomeCreditId },
        `[Sync] ${metronomeItem} not found on Metronome, skipping`
      );
      continue;
    }

    // Metronome balance is in USD; our DB values are in micro-USD.
    const metronomeBalanceUsd = metronomeEntry.balance;
    if (metronomeBalanceUsd === undefined) {
      logger.warn(
        { workspaceId: workspace.sId, creditId: credit.id, metronomeCreditId },
        `[Sync] ${metronomeItem} has no balance field on Metronome, skipping`
      );
      continue;
    }

    // Verify the initial amount on Metronome matches the one in DB before
    // doing anything. Mismatch means the credit was set up with different
    // values on each side and we should not attempt to reconcile consumption.
    const scheduleItems = metronomeEntry.access_schedule?.schedule_items ?? [];
    if (scheduleItems.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId, creditId: credit.id, metronomeCreditId },
        `[Sync] ${metronomeItem} has no access_schedule segments, skipping`
      );
      continue;
    }
    const metronomeInitialAmountUsd = scheduleItems.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const metronomeInitialAmountMicroUsd = Math.round(
      metronomeInitialAmountUsd * 1_000_000
    );
    if (metronomeInitialAmountMicroUsd !== credit.initialAmountMicroUsd) {
      const dbInitialAmountUsd = credit.initialAmountMicroUsd / 1_000_000;

      // We only auto-reconcile free credits. For commits, log and skip — these
      // need to be reconciled manually since they affect billing.
      if (type !== "free") {
        logger.warn(
          {
            workspaceId: workspace.sId,
            creditId: credit.id,
            metronomeCreditId,
            metronomeInitialAmountUsd,
            dbInitialAmountUsd,
          },
          `[Sync] ${metronomeItem} initial amount mismatch between Metronome and DB, skipping`
        );
        continue;
      }

      // Updating with multiple segments is ambiguous — we don't know how to
      // distribute the new total across them. Bail out and let an operator
      // reconcile manually.
      if (scheduleItems.length > 1) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            creditId: credit.id,
            metronomeCreditId,
            metronomeInitialAmountUsd,
            dbInitialAmountUsd,
            scheduleItemsCount: scheduleItems.length,
          },
          `[Sync] ${metronomeItem} initial amount mismatch with multiple segments, cannot reconcile, skipping`
        );
        continue;
      }

      // Auto-update the segment amount via v2.contracts.edit, which requires
      // a contract id. Recurring free credits live on the workspace's active
      // contract — its absence here indicates stale data (a free-renewal-*
      // credit lingering after a downgrade).
      if (!metronomeContractId) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            creditId: credit.id,
            metronomeCreditId,
            metronomeInitialAmountUsd,
            dbInitialAmountUsd,
          },
          `[Sync] ${metronomeItem} initial amount mismatch but workspace has no active Metronome contract, skipping`
        );
        continue;
      }

      const segmentId = scheduleItems[0].id;

      if (!execute) {
        logger.info(
          {
            workspaceId: workspace.sId,
            creditId: credit.id,
            metronomeCreditId,
            segmentId,
            metronomeInitialAmountUsd,
            dbInitialAmountUsd,
          },
          `[Sync] [DRY RUN] Would update ${metronomeItem} initial amount on Metronome from $${metronomeInitialAmountUsd.toFixed(6)} to $${dbInitialAmountUsd.toFixed(6)}`
        );
        continue;
      }

      const updateResult = await updateMetronomeCreditSegmentAmount({
        metronomeCustomerId,
        contractId: metronomeContractId,
        creditId: metronomeCreditId,
        segmentId,
        amount: dbInitialAmountUsd,
      });

      if (updateResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            creditId: credit.id,
            metronomeCreditId,
            metronomeInitialAmountUsd,
            dbInitialAmountUsd,
            error: updateResult.error.message,
          },
          `[Sync] Failed to update ${metronomeItem} initial amount on Metronome`
        );
        continue;
      }

      logger.info(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          metronomeInitialAmountUsd,
          dbInitialAmountUsd,
        },
        `[Sync] Updated ${metronomeItem} initial amount on Metronome from $${metronomeInitialAmountUsd.toFixed(6)} to $${dbInitialAmountUsd.toFixed(6)}, deferring consumption sync to next run`
      );
      continue;
    }

    // Work in micro-USD integers to avoid floating-point noise.
    const metronomeBalanceMicroUsd = Math.round(
      metronomeBalanceUsd * 1_000_000
    );
    const dbRemainingMicroUsd =
      credit.initialAmountMicroUsd - credit.consumedAmountMicroUsd;

    // adjustmentMicroUsd is signed:
    //   > 0 → Metronome has consumed less than DB → deduct from Metronome.
    //   < 0 → Metronome has consumed more than DB → top up Metronome to match.
    // deductMetronomeCreditBalance negates `amount` internally, so passing the
    // signed value here applies the correct delta in either direction.
    const adjustmentMicroUsd = metronomeBalanceMicroUsd - dbRemainingMicroUsd;
    const adjustmentUsd = adjustmentMicroUsd / 1_000_000;

    if (Math.abs(adjustmentMicroUsd) <= DEDUCTION_THRESHOLD_MICRO_USD) {
      logger.info(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          metronomeBalanceUsd,
          dbRemainingUsd: dbRemainingMicroUsd / 1_000_000,
          adjustmentUsd,
        },
        `[Sync] ${metronomeItem} in sync (within $0.01 tolerance), no action needed`
      );
      continue;
    }

    const direction = adjustmentMicroUsd > 0 ? "deduction" : "correction";
    const absAdjustmentUsd = Math.abs(adjustmentUsd);

    // Use the first (and typically only) segment.
    const segmentId = scheduleItems[0].id;

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          segmentId,
          metronomeBalanceUsd,
          dbRemainingUsd: dbRemainingMicroUsd / 1_000_000,
          adjustmentUsd,
        },
        `[Sync] [DRY RUN] Would apply ${direction} of $${absAdjustmentUsd.toFixed(6)} to ${metronomeItem}`
      );
      continue;
    }

    // Pass the parent contract id when present — contract-level
    // commits / credits cannot be located by `addManualBalanceEntry`
    // without it (Metronome returns "Unable to find commit ..." 404).
    const entryContractId = metronomeEntry.contract?.id;

    const adjustResult = await deductMetronomeCreditBalance({
      metronomeCustomerId,
      contractId: entryContractId,
      creditId: metronomeCreditId,
      segmentId,
      amount: adjustmentUsd,
      reason: `Consumption sync from DB (credit #${credit.id})`,
    });

    if (adjustResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          adjustmentUsd,
          error: adjustResult.error.message,
        },
        `[Sync] Failed to apply ${direction} to ${metronomeItem} on Metronome`
      );
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        creditId: credit.id,
        metronomeCreditId,
        adjustmentUsd,
      },
      `[Sync] Successfully applied ${direction} of $${absAdjustmentUsd.toFixed(6)} to ${metronomeItem}`
    );
  }
}

async function syncCreditsForWorkspace(
  workspace: LightWorkspaceType,
  type: SyncType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  if (workspace.metadata?.maintenance) {
    logger.info(
      {
        workspaceId: workspace.sId,
        maintenance: workspace.metadata.maintenance,
      },
      "[Sync] Workspace is in maintenance mode, skipping"
    );
    return;
  }

  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return; // Workspace not provisioned in Metronome — skip.
  }

  // A Metronome contract isn't required for the consumption sync itself
  // (deductions are applied at the customer level). Only the initial-amount
  // auto-update path needs one and handles its absence inline.
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  const metronomeContractId = subscription?.metronomeContractId ?? null;

  if (type === "free" || type === "all") {
    await syncCreditsOfType(
      workspace,
      "free",
      metronomeCustomerId,
      metronomeContractId,
      execute,
      logger
    );
  }
  if (type === "committed" || type === "all") {
    await syncCreditsOfType(
      workspace,
      "committed",
      metronomeCustomerId,
      metronomeContractId,
      execute,
      logger
    );
  }
}

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
    type: {
      type: "string" as const,
      description: 'Credit type to sync: "free", "committed", or "all"',
      default: "all",
    },
  },
  async ({ workspaceId, type, execute }, logger) => {
    if (type !== "free" && type !== "committed" && type !== "all") {
      throw new Error(
        `Invalid type "${type}". Must be "free", "committed", or "all".`
      );
    }

    await runOnAllWorkspaces(
      async (workspace) => {
        await syncCreditsForWorkspace(
          workspace,
          type as SyncType,
          execute,
          logger
        );
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
