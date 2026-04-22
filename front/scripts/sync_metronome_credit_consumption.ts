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
} from "@app/lib/metronome/client";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

type SyncType = "free" | "committed" | "all";

// Tolerance in USD below which we skip the deduction (floating-point noise).
const DEDUCTION_THRESHOLD_USD = 0.000_001;

async function syncCreditsOfType(
  workspace: LightWorkspaceType,
  type: "free" | "committed",
  metronomeCustomerId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const allCredits = await CreditResource.listAll(auth);
  const credits = allCredits.filter(
    (c) => c.type === type && c.metronomeCreditId !== null
  );

  if (credits.length === 0) {
    logger.info(
      { workspaceId: workspace.sId, creditType: type },
      `[Sync] No credits of type "${type}" with a Metronome ID, skipping`
    );
    return;
  }

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

    // Metronome balance is in USD; our DB values are in micro USD.
    const metronomeBalanceUsd = metronomeEntry.balance;
    if (metronomeBalanceUsd === undefined) {
      logger.warn(
        { workspaceId: workspace.sId, creditId: credit.id, metronomeCreditId },
        `[Sync] ${metronomeItem} has no balance field on Metronome, skipping`
      );
      continue;
    }

    const dbRemainingUsd =
      (credit.initialAmountMicroUsd - credit.consumedAmountMicroUsd) /
      1_000_000;

    // Metronome consumed = initial - balance; DB consumed = consumedAmountMicroUsd / 1e6.
    // If metronomeBalance > dbRemaining, Metronome has consumed less than DB.
    const deductionUsd = metronomeBalanceUsd - dbRemainingUsd;

    if (deductionUsd <= DEDUCTION_THRESHOLD_USD) {
      logger.info(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          metronomeBalanceUsd,
          dbRemainingUsd,
          deductionUsd,
        },
        `[Sync] ${metronomeItem} in sync (or Metronome has consumed more), no action needed`
      );
      continue;
    }

    // Resolve the segment ID from the access schedule.
    const scheduleItems = metronomeEntry.access_schedule?.schedule_items ?? [];
    if (scheduleItems.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId, creditId: credit.id, metronomeCreditId },
        `[Sync] ${metronomeItem} has no access_schedule segments, cannot add ledger entry`
      );
      continue;
    }
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
          dbRemainingUsd,
          deductionUsd,
        },
        `[Sync] [DRY RUN] Would add manual ledger deduction of $${deductionUsd.toFixed(6)} to ${metronomeItem}`
      );
      continue;
    }

    const deductResult = await deductMetronomeCreditBalance({
      metronomeCustomerId,
      creditId: metronomeCreditId,
      segmentId,
      amount: deductionUsd,
      reason: `Consumption sync from DB (credit #${credit.id})`,
    });

    if (deductResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          metronomeCreditId,
          deductionUsd,
          error: deductResult.error.message,
        },
        `[Sync] Failed to add ledger entry to ${metronomeItem} on Metronome`
      );
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        creditId: credit.id,
        metronomeCreditId,
        deductionUsd,
      },
      `[Sync] Successfully added ledger deduction of $${deductionUsd.toFixed(6)} to ${metronomeItem}`
    );
  }
}

async function syncCreditsForWorkspace(
  workspace: LightWorkspaceType,
  type: SyncType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return; // Workspace not provisioned in Metronome — skip.
  }

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return;
  }

  if (type === "free" || type === "all") {
    await syncCreditsOfType(
      workspace,
      "free",
      metronomeCustomerId,
      execute,
      logger
    );
  }
  if (type === "committed" || type === "all") {
    await syncCreditsOfType(
      workspace,
      "committed",
      metronomeCustomerId,
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
