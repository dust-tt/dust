/**
 * Backfill DB credits from Metronome.
 *
 * For each workspace with a metronomeCustomerId:
 * - Lists all credits from Metronome (with include_balance)
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
  floorToHourISO,
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

// Metronome publishes a 11 RPS API limit. Cap the script at 10 RPS to leave
// headroom for concurrent production traffic on the same API key.
const METRONOME_MAX_RPS = 10;
const METRONOME_MIN_INTERVAL_MS = 1000 / METRONOME_MAX_RPS;
let metronomeNextSlotAt = 0;

async function paceMetronome<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const slot = Math.max(now, metronomeNextSlotAt);
  metronomeNextSlotAt = slot + METRONOME_MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  return fn();
}

type FreeCreditSubtype =
  | "free-poke"
  | "free-yearly-renewal"
  | "free-renewal"
  | "unknown";

function getSubtypeFromDbCredit(
  invoiceOrLineItemId: string | null
): FreeCreditSubtype {
  if (!invoiceOrLineItemId) {
    return "unknown";
  }
  if (invoiceOrLineItemId.startsWith("free-poke-")) {
    return "free-poke";
  }
  if (invoiceOrLineItemId.startsWith("free-renewal-yearly-")) {
    return "free-yearly-renewal";
  }
  if (invoiceOrLineItemId.startsWith("free-renewal-")) {
    return "free-renewal";
  }
  return "unknown";
}

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
  logger.info({ workspaceId: workspace.sId }, "---- Starting ----");
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const programmaticUsdCreditTypeId = getCreditTypeProgrammaticUsdId();

  const creditsResult = await paceMetronome(() =>
    listMetronomeCustomerCredits({
      metronomeCustomerId,
      includeContractCredits: true,
      includeBalance: true,
      coveringDate: new Date().toISOString(),
    })
  );

  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: creditsResult.error.message },
      "[Backfill Metronome→DB] Failed to list credits from Metronome"
    );
    return;
  }

  const metronomeEntries: MetronomeBalance[] = creditsResult.value.filter(
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
        `${getSubtypeFromDbCredit(c.invoiceOrLineItemId)}:${floorToHourISO(c.startDate!)}:${floorToHourISO(c.expirationDate!)}`,
        c,
      ])
  );

  for (const entry of metronomeEntries) {
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

    const contractId = entry.contract?.id;
    const isPokeCredit = entry.name?.toLowerCase().includes("poke") ?? false;
    let subtype: FreeCreditSubtype;
    if (isPokeCredit) {
      subtype = "free-poke";
    } else if (contractId) {
      const periodDurationSeconds =
        (expirationDate.getTime() - startDate.getTime()) / 1000;
      const isAnnual = periodDurationSeconds >= 60 * 24 * 60 * 60; // every credit valid for more than 2 months is considered annual
      subtype = isAnnual ? "free-yearly-renewal" : "free-renewal";
    } else {
      subtype = "unknown";
    }

    const dateKey = `${subtype}:${floorToHourISO(startDate)}:${floorToHourISO(expirationDate)}`;
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
            startDate: startDate.toISOString(),
            expirationDate: expirationDate.toISOString(),
          },
          "[Backfill Metronome→DB] Already in DB by type+dates, skipping"
        );
      }
      continue;
    }

    const periodStartSeconds = Math.floor(startDate.getTime() / 1000);
    let invoiceOrLineItemId: string | null;
    if (subtype === "free-poke") {
      invoiceOrLineItemId = `free-poke-${workspace.sId}-${periodStartSeconds * 1000}`;
    } else if (subtype === "free-yearly-renewal" && contractId) {
      invoiceOrLineItemId = `free-renewal-yearly-${contractId}-${periodStartSeconds}`;
    } else if (subtype === "free-renewal" && contractId) {
      invoiceOrLineItemId = `free-renewal-${contractId}-${periodStartSeconds}`;
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
        type: "free",
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
    fromWorkspaceId: {
      type: "number" as const,
      description:
        "Resume from this numeric workspace model id (skips workspaces with id < this value)",
      required: false,
    },
  },
  async ({ workspaceId, fromWorkspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillFromMetronome(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId, fromWorkspaceId }
    );
  }
);
