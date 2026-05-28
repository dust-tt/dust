/**
 * List (and optionally fix) recurring monthly/annual free credits in
 * Metronome whose currently-active segment has amount = 0.
 *
 * Recurring free credits are seeded with amount=0 and bumped to the user-based
 * amount by the `credit.segment.start` webhook. If the webhook never fires (or
 * fails), the segment stays at 0 and the workspace gets no free credits for
 * the period.
 *
 * Without --execute, the script is read-only and just logs the findings.
 * With --execute, it patches each zero-amount segment in Metronome using the
 * same amount calculation as the webhook handler
 * (lib/api/metronome/process_webhook.ts credit.segment.start branch), then
 * mirrors the DB credit via grantFreeCreditFromMetronomeSegment.
 *
 * Run with:
 *   npx tsx scripts/fix_zero_amount_recurring_free_credits.ts \
 *     [--workspaceId <sId>] [--fromWorkspaceId <id>] [--execute]
 */

import { Authenticator } from "@app/lib/auth";
import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
  grantFreeCreditFromMetronomeSegment,
  YEARLY_MULTIPLIER,
} from "@app/lib/credits/free";
import {
  listMetronomeCustomerCredits,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import {
  FREE_ANNUAL_CREDIT_NAME,
  FREE_MONTHLY_CREDIT_NAME,
  isMetronomeFreeCredit,
  type MetronomeCredit,
} from "@app/lib/metronome/types";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
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
  fixedAmountMicroUsd?: number;
  fixError?: string;
}

// Compute the amount we should put on this segment, mirroring the
// `credit.segment.start` webhook handler. Returns micro-USD.
async function computeAmountMicroUsd({
  workspace,
  cadence,
}: {
  workspace: LightWorkspaceType;
  cadence: Cadence;
}): Promise<number> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  const isAnnual = cadence === "ANNUAL";

  if (programmaticConfig && programmaticConfig.freeCreditMicroUsd !== null) {
    return programmaticConfig.freeCreditMicroUsd;
  }

  const userCount = await countEligibleUsersForFreeCredits(workspace);
  const monthlyAmountMicroUsd = calculateFreeCreditAmountMicroUsd(userCount);
  return isAnnual
    ? monthlyAmountMicroUsd * YEARLY_MULTIPLIER
    : monthlyAmountMicroUsd;
}

async function fixSegment({
  workspace,
  finding,
  execute,
  logger,
}: {
  workspace: LightWorkspaceType;
  finding: Finding;
  execute: boolean;
  logger: Logger;
}): Promise<void> {
  if (!finding.contractId) {
    finding.fixError = "no contract id on credit, cannot patch segment";
    logger.warn(
      finding,
      "[ZeroAmountFreeCredits] Skipping fix: no contract id"
    );
    return;
  }

  const amountMicroUsd = await computeAmountMicroUsd({
    workspace,
    cadence: finding.cadence,
  });
  finding.fixedAmountMicroUsd = amountMicroUsd;

  if (amountMicroUsd === 0) {
    // The webhook handler would have set this to 0 too — surface it so a
    // human can investigate (zero eligible users? misconfigured override?).
    finding.fixError = "computed amount is 0, refusing to patch";
    logger.warn(
      finding,
      "[ZeroAmountFreeCredits] Computed amount is 0 — leaving segment as-is for manual review"
    );
    return;
  }

  if (!execute) {
    logger.info(
      finding,
      "[ZeroAmountFreeCredits] [DRY RUN] Would update segment amount and ensure DB credit"
    );
    return;
  }

  const amount = amountMicroUsd / 1_000_000;

  const updateResult = await paceMetronome(() =>
    updateMetronomeCreditSegmentAmount({
      metronomeCustomerId: finding.metronomeCustomerId,
      contractId: finding.contractId!,
      creditId: finding.creditId,
      segmentId: finding.segmentId,
      amount,
    })
  );

  if (updateResult.isErr()) {
    finding.fixError = `updateMetronomeCreditSegmentAmount failed: ${updateResult.error.message}`;
    logger.error(
      { ...finding, error: updateResult.error.message },
      "[ZeroAmountFreeCredits] Failed to update segment amount"
    );
    return;
  }

  // Mirror the DB-side grant the webhook handler does after a successful
  // Metronome update. Idempotent: the helper skips if a DB credit already
  // exists for this period.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const grantResult = await grantFreeCreditFromMetronomeSegment({
    auth,
    metronomeCreditId: finding.creditId,
    contractId: finding.contractId,
    segmentId: finding.segmentId,
    isAnnual: finding.cadence === "ANNUAL",
    amountMicroUsd,
    periodStart: new Date(finding.startingAt),
    periodEnd: new Date(finding.endingBefore),
  });

  if (grantResult.isErr()) {
    finding.fixError = `Metronome patched but DB grant failed: ${grantResult.error.message}`;
    logger.error(
      { ...finding, error: grantResult.error.message },
      "[ZeroAmountFreeCredits] Metronome amount fixed but DB credit grant failed"
    );
    return;
  }

  logger.info(
    {
      ...finding,
      dbCreditId: grantResult.value.credit.id,
      dbCreated: grantResult.value.created,
      dbAlreadyExisted: grantResult.value.alreadyExisted,
    },
    "[ZeroAmountFreeCredits] Segment amount fixed"
  );
}

async function findZeroAmountSegments(
  workspace: LightWorkspaceType,
  execute: boolean,
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
    if (!credit.recurring_credit_id) {
      continue;
    }

    const activeSegment = credit.access_schedule?.schedule_items.find((s) => {
      const startMs = new Date(s.starting_at).getTime();
      const endMs = new Date(s.ending_before).getTime();
      return startMs <= now && now < endMs;
    });

    if (!activeSegment || activeSegment.amount !== 0) {
      continue;
    }

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
      execute
        ? "[ZeroAmountFreeCredits] Active segment has amount=0 — fixing"
        : "[ZeroAmountFreeCredits] Active segment has amount=0 (dry run)"
    );

    await fixSegment({ workspace, finding, execute, logger });
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
    const findings: Finding[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        await findZeroAmountSegments(workspace, execute, logger, findings);
      },
      // Drop concurrency when executing — each fix issues sequential
      // Metronome writes + an Authenticator.internalAdminForWorkspace lookup;
      // we don't want a thundering herd against the 11 RPS Metronome limit.
      { concurrency: execute ? 1 : 4, wId: workspaceId, fromWorkspaceId }
    );

    const fixed = findings.filter(
      (f) => f.fixedAmountMicroUsd && !f.fixError
    ).length;
    const failed = findings.filter((f) => f.fixError).length;
    logger.info(
      { total: findings.length, fixed, failed, execute },
      "[ZeroAmountFreeCredits] Done"
    );
  }
);
