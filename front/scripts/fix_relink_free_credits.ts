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
  getMetronomeClient,
  listMetronomeCustomerCredits,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import {
  isMetronomeFreeCredit,
  METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD,
} from "@app/lib/metronome/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";

import { makeScript } from "./helpers";

// Workspaces with the inconsistency to fix. Paste sIds here.
const WORKSPACE_IDS: string[] = [
  "49f9ef0520",
  "2WJ4Akk9tx",
  "yS7wSqtRaJ",
  "hjBiyjJhfT",
  "ORTQpNleHb",
  "vodkRTZeBn",
  "GS4hsmJeMr",
];

function getScheduleItem(entry: MetronomeBalance) {
  return entry.access_schedule?.schedule_items?.[0] ?? null;
}

// Maximum distance (on either the start or end date) allowed when matching a
// DB credit against a candidate Metronome credit. Wider than a strict
// hour-floor match because the new credit on the regenerated contract can be
// off by a few minutes from the DB credit's stored period.
const PERIOD_MATCH_TOLERANCE_MS = 25 * 60 * 60 * 1000; // 24 hours

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
  const now = new Date();

  // Only consider DB credits whose period covers NOW — the fix targets the
  // currently-active credit. Historical/expired DB credits are intentionally
  // skipped.
  const dbFreeCredits = (await CreditResource.listAll(auth)).filter(
    (c) =>
      c.type === "free" &&
      c.metronomeCreditId !== null &&
      c.startDate !== null &&
      c.expirationDate !== null &&
      c.startDate <= now &&
      c.expirationDate > now
  );

  if (dbFreeCredits.length === 0) {
    logger.info({ workspaceId }, "No active DB free credits to fix");
    return;
  }

  const creditsResult = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    includeContractCredits: true,
    includeBalance: true,
    coveringDate: now.toISOString(),
  });
  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId, error: creditsResult.error.message },
      "Failed to list Metronome credits"
    );
    return;
  }

  // List contracts to identify archived ones — credits on archived contracts
  // still have access_schedule covering NOW and so are returned by the credits
  // list, but they are effectively dead and must be excluded.
  const contractsResponse = await getMetronomeClient().v2.contracts.list({
    customer_id: metronomeCustomerId,
  });
  const archivedContractIds = new Set(
    contractsResponse.data
      .filter((c) => c.archived_at)
      .map((c) => c.id)
  );

  // Restrict to the "Free Monthly Credits" product (priority 1, programmatic
  // USD). This excludes the "Excess Credits" recurring credit, which has its
  // own product and would otherwise be a near-period match.
  const metronomeFreeCredits = creditsResult.value.filter((e) => {
    if (!isMetronomeFreeCredit(e)) {
      return false;
    }
    const contractId = e.contract?.id;
    if (contractId && archivedContractIds.has(contractId)) {
      return false;
    }
    return true;
  });

  for (const dbCredit of dbFreeCredits) {
    const dbStart = dbCredit.startDate!;
    const dbEnd = dbCredit.expirationDate!;
    const currentMetronomeCreditId = dbCredit.metronomeCreditId!;

    // Score candidates by max(|startDiff|, |endDiff|) — pick the closest
    // period, as long as it's within tolerance on both ends.
    const ranked: Array<{ entry: MetronomeBalance; score: number }> = [];
    for (const entry of metronomeFreeCredits) {
      if (entry.id === currentMetronomeCreditId) {
        continue;
      }
      const item = getScheduleItem(entry);
      if (!item) {
        continue;
      }
      const startDiffMs = Math.abs(
        new Date(item.starting_at).getTime() - dbStart.getTime()
      );
      const endDiffMs = Math.abs(
        new Date(item.ending_before).getTime() - dbEnd.getTime()
      );
      const score = Math.max(startDiffMs, endDiffMs);
      if (score <= PERIOD_MATCH_TOLERANCE_MS) {
        ranked.push({ entry, score });
      }
    }
    ranked.sort((a, b) => a.score - b.score);

    const replacement = ranked[0]?.entry;

    if (!replacement) {
      logger.info(
        {
          workspaceId,
          dbCreditId: dbCredit.id,
          currentMetronomeCreditId,
          dbStart: dbStart.toISOString(),
          dbEnd: dbEnd.toISOString(),
          activeFreeCreditCount: metronomeFreeCredits.length,
        },
        "No replacement Metronome credit within tolerance — skipping"
      );
      continue;
    }

    const contractId = replacement.contract?.id;
    const replacementItem = getScheduleItem(replacement);
    if (!contractId || !replacementItem) {
      logger.warn(
        {
          workspaceId,
          dbCreditId: dbCredit.id,
          replacementCreditId: replacement.id,
          hasContract: Boolean(contractId),
          hasScheduleItem: Boolean(replacementItem),
        },
        "Replacement credit missing contract or schedule item — skipping"
      );
      continue;
    }

    // Guard: the replacement must be a fresh credit at 0 balance. If the
    // webhook had missed the amount update, Metronome's default amount is 0
    // and balance is 0. A non-zero balance means the credit was already
    // (partially) used — relinking would clobber real consumption.
    if ((replacement.balance ?? 0) !== 0) {
      logger.warn(
        {
          workspaceId,
          dbCreditId: dbCredit.id,
          replacementCreditId: replacement.id,
          balance: replacement.balance,
        },
        "Replacement credit balance is not 0 — skipping"
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
        dbCreditId: dbCredit.id,
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
            dbCreditId: dbCredit.id,
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
        dbCreditId: dbCredit.id,
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
