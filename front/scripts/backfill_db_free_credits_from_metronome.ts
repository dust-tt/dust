/**
 * Backfill DB credits from Metronome.
 *
 * For each workspace with a metronomeCustomerId:
 * - Lists all credits and commits from Metronome (with include_balance)
 * - For each entry, checks if it already exists in DB by metronomeCreditId or
 *   by the (type, startDate, expirationDate) unique key
 * - If not found in DB, creates a new credit row with the right amounts, dates,
 *   and metronomeCreditId
 *
 * Idempotent: re-running will skip entries already present in DB.
 *
 * Run with: npx tsx scripts/backfill_db_free_credits_from_metronome.ts [--execute] [--workspaceId <sId>]
 */

import { Authenticator } from "@app/lib/auth";
import {
  ceilToHourISO,
  floorToHourISO,
  listMetronomeCustomerCommits,
  listMetronomeCustomerCredits,
} from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import { METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD } from "@app/lib/metronome/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

function getScheduleTotals(entry: MetronomeBalance): {
  initialAmountMicroUsd: number;
  startDate: Date | null;
  expirationDate: Date | null;
} {
  const item = entry.access_schedule?.schedule_items?.[0];
  if (!item) {
    return { initialAmountMicroUsd: 0, startDate: null, expirationDate: null };
  }

  return {
    initialAmountMicroUsd: Math.round(
      item.amount * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD
    ),
    startDate: new Date(item.starting_at),
    expirationDate: new Date(item.ending_before),
  };
}

async function backfillFromMetronome(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const programmaticUsdCreditTypeId = getCreditTypeProgrammaticUsdId();

  const [creditsResult, commitsResult] = await Promise.all([
    listMetronomeCustomerCredits({
      metronomeCustomerId,
      includeContractCredits: true,
      includeBalance: true,
    }),
    listMetronomeCustomerCommits({
      metronomeCustomerId,
      includeContractCommits: true,
      includeBalance: true,
    }),
  ]);

  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: creditsResult.error.message },
      "[Backfill Metronome→DB] Failed to list credits from Metronome"
    );
    return;
  }
  if (commitsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: commitsResult.error.message },
      "[Backfill Metronome→DB] Failed to list commits from Metronome"
    );
    return;
  }

  const metronomeEntries: MetronomeBalance[] = [
    ...creditsResult.value,
    ...commitsResult.value,
  ].filter(
    (entry) =>
      entry.access_schedule?.credit_type?.id === programmaticUsdCreditTypeId
  );

  if (metronomeEntries.length === 0) {
    return;
  }

  const metronomeEntryIds = new Set(metronomeEntries.map((e) => e.id));

  const dbCredits = (await CreditResource.listAll(auth)).filter(
    (c) => c.type === "free"
  );
  const existingMetronomeIds = new Set(
    dbCredits.map((c) => c.metronomeCreditId).filter((id) => id !== null)
  );
  const existingDateKeys = new Map(
    dbCredits
      .filter((c) => c.startDate !== null && c.expirationDate !== null)
      .map((c) => [
        `${c.type}:${floorToHourISO(c.startDate!)}:${ceilToHourISO(c.expirationDate!)}`,
        c,
      ])
  );

  for (const entry of metronomeEntries) {
    if (entry.type !== "CREDIT") {
      continue;
    }
    const creditType = "free";

    if (existingMetronomeIds.has(entry.id)) {
      logger.info(
        { workspaceId: workspace.sId, metronomeId: entry.id },
        "[Backfill Metronome→DB] Already in DB by metronomeCreditId, skipping"
      );
      continue;
    }

    const { initialAmountMicroUsd, startDate, expirationDate } =
      getScheduleTotals(entry);

    if (!startDate || !expirationDate || initialAmountMicroUsd === 0) {
      logger.warn(
        { workspaceId: workspace.sId, metronomeId: entry.id },
        "[Backfill Metronome→DB] No access_schedule dates or zero amount, skipping"
      );
      continue;
    }

    const dateKey = `${creditType}:${floorToHourISO(startDate)}:${ceilToHourISO(expirationDate)}`;
    const existingByDates = existingDateKeys.get(dateKey);
    if (existingByDates) {
      if (
        !existingByDates.metronomeCreditId ||
        !metronomeEntryIds.has(existingByDates.metronomeCreditId)
      ) {
        const reason = !existingByDates.metronomeCreditId
          ? "missing metronomeCreditId"
          : "metronomeCreditId not in current Metronome entries";
        logger.info(
          {
            workspaceId: workspace.sId,
            metronomeId: entry.id,
            existingMetronomeCreditId: existingByDates.metronomeCreditId,
            creditId: existingByDates.id,
            creditType,
            startDate: startDate.toISOString(),
            expirationDate: expirationDate.toISOString(),
            reason,
          },
          execute
            ? "[Backfill Metronome→DB] Already in DB by type+dates, updating metronomeCreditId"
            : "[Backfill Metronome→DB] [DRY RUN] Already in DB by type+dates, would update metronomeCreditId"
        );
        if (execute) {
          await existingByDates.setMetronomeCreditId(entry.id);
          existingMetronomeIds.add(entry.id);
        }
      } else {
        logger.info(
          {
            workspaceId: workspace.sId,
            metronomeId: entry.id,
            creditType,
            startDate: startDate.toISOString(),
            expirationDate: expirationDate.toISOString(),
          },
          "[Backfill Metronome→DB] Already in DB by type+dates, skipping"
        );
      }
      continue;
    }

    // Define invoiceOrLineItemId
    const contractId = entry.contract?.id;
    const periodStartSeconds = Math.floor(startDate.getTime() / 1000);
    const isPokeCredit = entry.name?.toLowerCase().includes("poke") ?? false;
    let invoiceOrLineItemId: string | null;
    if (isPokeCredit) {
      invoiceOrLineItemId = `free-poke-${workspace.sId}-${periodStartSeconds * 1000}`;
    } else if (contractId) {
      const periodDurationSeconds =
        (expirationDate.getTime() - startDate.getTime()) / 1000;
      const isAnnual = periodDurationSeconds >= 60 * 24 * 60 * 60; // every credit valid for more than 2 months is considered annual
      invoiceOrLineItemId = isAnnual
        ? `free-renewal-yearly-${contractId}-${periodStartSeconds}`
        : `free-renewal-${contractId}-${periodStartSeconds}`;
    } else {
      invoiceOrLineItemId = null;
    }

    const balanceCredits =
      entry.balance ??
      initialAmountMicroUsd / METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;
    const remainingAmountMicroUsd = Math.round(
      balanceCredits * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD
    );
    const consumedAmountMicroUsd = Math.max(
      0,
      initialAmountMicroUsd - remainingAmountMicroUsd
    );

    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeId: entry.id,
        creditType,
        initialUsd: initialAmountMicroUsd / 1_000_000,
        consumedUsd: consumedAmountMicroUsd / 1_000_000,
        startDate: startDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
      },
      execute
        ? "[Backfill Metronome→DB] Creating credit in DB"
        : "[Backfill Metronome→DB] [DRY RUN] Would create credit in DB"
    );

    if (!execute) {
      continue;
    }

    try {
      const credit = await CreditResource.makeNew(auth, {
        type: creditType,
        startDate,
        expirationDate,
        initialAmountMicroUsd,
        consumedAmountMicroUsd,
        metronomeCreditId: entry.id,
        invoiceOrLineItemId,
        discount: null,
      });

      existingMetronomeIds.add(entry.id);
      existingDateKeys.set(dateKey, credit);

      logger.info(
        {
          workspaceId: workspace.sId,
          metronomeId: entry.id,
          creditId: credit.id,
        },
        "[Backfill Metronome→DB] Credit created in DB"
      );
    } catch (error) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeId: entry.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "[Backfill Metronome→DB] Failed to create credit in DB"
      );
    }
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
  },
  async ({ workspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillFromMetronome(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
