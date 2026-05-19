/**
 * Fix free credits inconsistency between DB and Metronome.
 *
 * Pattern observed: a DB free credit's `metronomeCreditId` points to a
 * Metronome credit on an expired (archived) contract. A new credit was created
 * on the replacement contract for the same period (floored to hour) but the
 * webhook missed it: the new credit's amount was never updated to the
 * workspace-specific value, and the DB credit was not relinked.
 *
 * For each workspace in WORKSPACE_IDS:
 *   - List Metronome free credits (with contract credits + balance)
 *   - For each DB free credit, find a Metronome credit with the same period
 *     (floored to hour) that is NOT the one currently linked in DB
 *   - If the new Metronome credit's initial amount differs from the DB credit,
 *     update it via `update_credits.access_schedule.update_schedule_items`
 *   - Relink the DB credit to the new Metronome credit
 *
 * Run with: npx tsx scripts/fix_relink_free_credits.ts [--execute]
 */

import { Authenticator } from "@app/lib/auth";
import {
  floorToHourISO,
  listMetronomeCustomerCredits,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import { METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD } from "@app/lib/metronome/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";

import { makeScript } from "./helpers";

// Workspaces with the inconsistency to fix. Paste sIds here.
const WORKSPACE_IDS: string[] = [
  "49f9ef0520",
  "WUuX9VBqwF",
  "2WJ4Akk9tx",
  "atT2TeOqa4",
  "PegKTAv4cg",
  "sqYRp9mFBN",
  "5sV32qY0CX",
  "0Vgu5dAnjG",
  "men44ZH3kn",
  "Gj56uy9w6U",
  "lP3KgC0BLA",
  "u9nmAQUb1E",
  "yS7wSqtRaJ",
  "gSa1x8RAO3",
  "Uo09m7SiSn",
  "eAbL8aWJ5l",
  "UUQVDrWpp6",
  "dbg2mtkdoz",
  "5I1GcnAiKP",
  "AS5yQ8VlxB",
  "PdFEWfJvCe",
  "uS45PeA7V6",
  "YO0dpaDq8V",
  "nywZdQhpcD",
  "g2rz4uIq72",
  "AirVtQzd2U",
  "hjBiyjJhfT",
  "cbKRJijTjP",
  "j4Y4ODxZoC",
  "xkxSt22yJq",
  "QDvlW37GDZ",
  "ORTQpNleHb",
  "TKnpzhPefR",
  "vKPuYMo37z",
  "vodkRTZeBn",
  "FF780bKHpd",
  "GS4hsmJeMr",
];

const PROGRAMMATIC_USD_CREDIT_TYPE_ID = getCreditTypeProgrammaticUsdId();

function getScheduleItem(entry: MetronomeBalance) {
  return entry.access_schedule?.schedule_items?.[0] ?? null;
}

function getPeriodKey(startingAt: string, endingBefore: string): string {
  return `${floorToHourISO(new Date(startingAt))}:${floorToHourISO(new Date(endingBefore))}`;
}

async function processWorkspace(
  workspaceId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "Workspace not found");
    return;
  }
  const metronomeCustomerId = workspace.metronomeCustomerId;
  if (!metronomeCustomerId) {
    logger.error({ workspaceId }, "Workspace has no metronomeCustomerId");
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const dbFreeCredits = (await CreditResource.listAll(auth)).filter(
    (c) =>
      c.type === "free" &&
      c.metronomeCreditId !== null &&
      c.startDate !== null &&
      c.expirationDate !== null
  );

  if (dbFreeCredits.length === 0) {
    logger.info({ workspaceId }, "No DB free credits with metronomeCreditId");
    return;
  }

  const creditsResult = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    includeContractCredits: true,
    includeBalance: true,
    coveringDate: new Date().toISOString(),
  });
  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId, error: creditsResult.error.message },
      "Failed to list Metronome credits"
    );
    return;
  }

  const metronomeFreeCredits = creditsResult.value.filter(
    (e) =>
      e.access_schedule?.credit_type?.id === PROGRAMMATIC_USD_CREDIT_TYPE_ID
  );

  // Index Metronome credits by period (floored to hour). The new credit and
  // the old expired credit share the same period in this pattern.
  const byPeriod = new Map<string, MetronomeBalance[]>();
  for (const entry of metronomeFreeCredits) {
    const item = getScheduleItem(entry);
    if (!item) {
      continue;
    }
    const key = getPeriodKey(item.starting_at, item.ending_before);
    const list = byPeriod.get(key) ?? [];
    list.push(entry);
    byPeriod.set(key, list);
  }

  for (const dbCredit of dbFreeCredits) {
    const dbStart = dbCredit.startDate!;
    const dbEnd = dbCredit.expirationDate!;
    const currentMetronomeCreditId = dbCredit.metronomeCreditId!;
    const dbKey = getPeriodKey(dbStart.toISOString(), dbEnd.toISOString());

    const candidates = byPeriod.get(dbKey) ?? [];
    const replacement = candidates.find(
      (c) => c.id !== currentMetronomeCreditId
    );

    if (!replacement) {
      logger.info(
        {
          workspaceId,
          dbCreditId: dbCredit.sId,
          currentMetronomeCreditId,
          period: dbKey,
        },
        "No replacement Metronome credit found for this period — skipping"
      );
      continue;
    }

    const contractId = replacement.contract?.id;
    const replacementItem = getScheduleItem(replacement);
    if (!contractId || !replacementItem) {
      logger.warn(
        {
          workspaceId,
          dbCreditId: dbCredit.sId,
          replacementCreditId: replacement.id,
          hasContract: Boolean(contractId),
          hasScheduleItem: Boolean(replacementItem),
        },
        "Replacement credit missing contract or schedule item — skipping"
      );
      continue;
    }

    const expectedAmount =
      dbCredit.initialAmountMicroUsd /
      METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;
    const currentAmount = replacementItem.amount;
    const amountsMatch = currentAmount === expectedAmount;

    logger.info(
      {
        workspaceId,
        dbCreditId: dbCredit.sId,
        dbInitialMicroUsd: dbCredit.initialAmountMicroUsd,
        oldMetronomeCreditId: currentMetronomeCreditId,
        newMetronomeCreditId: replacement.id,
        newContractId: contractId,
        newSegmentId: replacementItem.id,
        currentAmount,
        expectedAmount,
        willUpdateAmount: !amountsMatch,
      },
      execute
        ? "[Fix] Relinking DB credit to new Metronome credit"
        : "[Fix] [DRY RUN] Would relink DB credit to new Metronome credit"
    );

    if (!execute) {
      continue;
    }

    if (!amountsMatch) {
      const updateResult = await updateMetronomeCreditSegmentAmount({
        metronomeCustomerId,
        contractId,
        creditId: replacement.id,
        segmentId: replacementItem.id,
        amount: expectedAmount,
      });
      if (updateResult.isErr()) {
        logger.error(
          {
            workspaceId,
            dbCreditId: dbCredit.sId,
            newMetronomeCreditId: replacement.id,
            error: updateResult.error.message,
          },
          "Failed to update Metronome credit amount — skipping relink"
        );
        continue;
      }
    }

    await dbCredit.setMetronomeCreditId(replacement.id);
    logger.info(
      {
        workspaceId,
        dbCreditId: dbCredit.sId,
        newMetronomeCreditId: replacement.id,
      },
      "DB credit relinked"
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  if (WORKSPACE_IDS.length === 0) {
    logger.warn("WORKSPACE_IDS is empty — nothing to do");
    return;
  }
  for (const workspaceId of WORKSPACE_IDS) {
    try {
      await processWorkspace(workspaceId, execute, logger);
    } catch (err) {
      logger.error(
        {
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Workspace processing failed"
      );
    }
  }
});
