/**
 * List recurring monthly/annual free credits in Metronome whose currently-
 * active segment has amount = 0.
 *
 * Recurring free credits are seeded with amount=0 and bumped to the user-based
 * amount by the `credit.segment.start` webhook. If the webhook never fires (or
 * fails), the segment stays at 0 and the workspace gets no free credits for
 * the period.
 *
 * Read-only — prints a summary table at the end.
 *
 * Run with:
 *   npx tsx scripts/list_zero_amount_recurring_free_credits.ts \
 *     [--workspaceId <sId>] [--fromWorkspaceId <id>]
 */

import { listMetronomeCustomerCredits } from "@app/lib/metronome/client";
import {
  FREE_ANNUAL_CREDIT_NAME,
  FREE_MONTHLY_CREDIT_NAME,
  isMetronomeFreeCredit,
  type MetronomeCredit,
} from "@app/lib/metronome/types";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// Metronome publishes an 11 RPS API limit. Cap the script at 10 RPS to leave
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

type Cadence = "MONTHLY" | "ANNUAL";

function getCadence(credit: MetronomeCredit): Cadence | null {
  if (credit.name === FREE_MONTHLY_CREDIT_NAME) {
    return "MONTHLY";
  }
  if (credit.name === FREE_ANNUAL_CREDIT_NAME) {
    return "ANNUAL";
  }
  return null;
}

interface Finding {
  workspaceSId: string;
  workspaceName: string;
  metronomeCustomerId: string;
  contractId: string | undefined;
  creditId: string;
  recurringCreditId: string | undefined;
  cadence: Cadence;
  segmentId: string;
  startingAt: string;
  endingBefore: string;
}

async function findZeroAmountSegments(
  workspace: LightWorkspaceType,
  logger: Logger,
  findings: Finding[]
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const nowIso = new Date().toISOString();

  const creditsResult = await paceMetronome(() =>
    listMetronomeCustomerCredits({
      metronomeCustomerId,
      includeContractCredits: true,
      coveringDate: nowIso,
    })
  );

  if (creditsResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        error: creditsResult.error.message,
      },
      "[ZeroAmountFreeCredits] Failed to list credits"
    );
    return;
  }

  const now = Date.now();

  for (const credit of creditsResult.value) {
    if (!isMetronomeFreeCredit(credit)) {
      continue;
    }
    const cadence = getCadence(credit);
    if (!cadence) {
      continue;
    }
    // Only recurring instances have a recurring_credit_id. Skip one-off free
    // credits that happen to share the name (defensive — they shouldn't).
    if (!credit.recurring_credit_id) {
      continue;
    }

    const activeSegment = credit.access_schedule?.schedule_items.find((s) => {
      const startMs = new Date(s.starting_at).getTime();
      const endMs = new Date(s.ending_before).getTime();
      return startMs <= now && now < endMs;
    });

    if (!activeSegment) {
      continue;
    }

    if (activeSegment.amount === 0) {
      const finding: Finding = {
        workspaceSId: workspace.sId,
        workspaceName: workspace.name,
        metronomeCustomerId,
        contractId: credit.contract?.id,
        creditId: credit.id,
        recurringCreditId: credit.recurring_credit_id,
        cadence,
        segmentId: activeSegment.id,
        startingAt: activeSegment.starting_at,
        endingBefore: activeSegment.ending_before,
      };
      findings.push(finding);
      logger.warn(
        finding,
        "[ZeroAmountFreeCredits] Active segment has amount=0"
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
  async ({ workspaceId, fromWorkspaceId }, logger) => {
    const findings: Finding[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        await findZeroAmountSegments(workspace, logger, findings);
      },
      { concurrency: 4, wId: workspaceId, fromWorkspaceId }
    );

    logger.info(
      { count: findings.length },
      "[ZeroAmountFreeCredits] Done. Recurring free credits with amount=0 active segment:"
    );

    // Print CSV to stdout so the result is easy to copy / pipe to a file.
    // Header + one row per finding.
    const header = [
      "workspaceSId",
      "workspaceName",
      "metronomeCustomerId",
      "contractId",
      "creditId",
      "recurringCreditId",
      "cadence",
      "segmentId",
      "startingAt",
      "endingBefore",
    ].join(",");
    process.stdout.write(`${header}\n`);
    for (const f of findings) {
      const row = [
        f.workspaceSId,
        JSON.stringify(f.workspaceName),
        f.metronomeCustomerId,
        f.contractId ?? "",
        f.creditId,
        f.recurringCreditId ?? "",
        f.cadence,
        f.segmentId,
        f.startingAt,
        f.endingBefore,
      ].join(",");
      process.stdout.write(`${row}\n`);
    }
  }
);
