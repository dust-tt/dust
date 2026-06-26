/**
 * Backfill a one-year expiry onto contract commits and credits that were granted
 * a far-future (2999) "forever" access window.
 *
 * The initial-credits, AWU top-up and business-activation seat commits used to be
 * created with `ending_before = 2999-01-01` and `DUST_CARRY_ON_RENEWAL=forever`,
 * so they never expired and carried their full balance forever across renewals.
 * We now grant them a one-year window instead. This rewrites the existing forever
 * entries to expire one year after they start, and stamps the same absolute date
 * on `DUST_CARRY_ON_RENEWAL` so the expiry is preserved (not reset) when a balance
 * is carried onto a renewed contract.
 *
 * Targets only contract entries flagged `DUST_CARRY_ON_RENEWAL` whose access
 * window is far-future. Idempotent: entries whose window is already finite are
 * skipped.
 *
 * NOTE: an entry that started more than a year ago resolves to a past expiry and
 * is expired retroactively. The dry run (default) logs every entry and its
 * computed new end (flagging the retroactive ones) so you can review before
 * passing --execute.
 *
 * Run with: npx tsx scripts/backfill_contract_credit_expiry.ts [--execute] [--workspaceId <sId>]
 */

import {
  floorToHourISO,
  getMetronomeClient,
  listMetronomeCustomerCommits,
  listMetronomeCustomerCredits,
  setMetronomeCommitCustomFields,
  setMetronomeContractCreditCustomFields,
} from "@app/lib/metronome/client";
import {
  CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY,
  FOREVER_ENDING_BEFORE,
  oneYearAfter,
} from "@app/lib/metronome/constants";
import type {
  MetronomeCommit,
  MetronomeCredit,
} from "@app/lib/metronome/types";
import type { Logger } from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

const FOREVER_MS = FOREVER_ENDING_BEFORE.getTime();

type Entry = MetronomeCommit | MetronomeCredit;

// Rewrite the access-schedule end date of a single commit/credit schedule item.
// Inlined here (rather than added to `lib/metronome/client.ts`) because it is a
// one-shot need for this disposable backfill; the rest of the codebase has no
// reason to edit a contract entry's access window.
async function updateAccessEndDate({
  kind,
  metronomeCustomerId,
  contractId,
  entryId,
  segmentId,
  endingBefore,
}: {
  kind: "commit" | "credit";
  metronomeCustomerId: string;
  contractId: string;
  entryId: string;
  segmentId: string;
  endingBefore: string;
}): Promise<Result<void, Error>> {
  const accessSchedule = {
    update_schedule_items: [{ id: segmentId, ending_before: endingBefore }],
  };
  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ...(kind === "commit"
        ? {
            update_commits: [
              { commit_id: entryId, access_schedule: accessSchedule },
            ],
          }
        : {
            update_credits: [
              { credit_id: entryId, access_schedule: accessSchedule },
            ],
          }),
    });
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

function isForeverEndingBefore(endingBefore: string): boolean {
  const ms = Date.parse(endingBefore);
  return !Number.isNaN(ms) && ms >= FOREVER_MS;
}

type EntryPlan = {
  contractId: string;
  segmentUpdates: Array<{ segmentId: string; endingBefore: string }>;
  carryValue: string;
};

function planForEntry(entry: Entry): EntryPlan | null {
  const carry = entry.custom_fields?.[CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY];
  if (carry === undefined) {
    return null;
  }
  const contractId = entry.contract?.id;
  if (!contractId) {
    return null;
  }
  const items = entry.access_schedule?.schedule_items ?? [];
  const foreverItems = items.filter((it) =>
    isForeverEndingBefore(it.ending_before)
  );
  if (foreverItems.length === 0) {
    return null;
  }
  const segmentUpdates = foreverItems.map((it) => ({
    segmentId: it.id,
    endingBefore: floorToHourISO(oneYearAfter(new Date(it.starting_at))),
  }));
  // The carry-on-renewal value is the entry's absolute expiry: one year after
  // its earliest start. With a single schedule item it matches the new window.
  const earliestStartMs = Math.min(
    ...items.map((it) => Date.parse(it.starting_at))
  );
  const carryValue = floorToHourISO(oneYearAfter(new Date(earliestStartMs)));
  return { contractId, segmentUpdates, carryValue };
}

async function processEntries({
  kind,
  entries,
  workspace,
  execute,
  logger,
  updateEndDate,
  setCarryCustomField,
}: {
  kind: "commit" | "credit";
  entries: Entry[];
  workspace: LightWorkspaceType;
  execute: boolean;
  logger: Logger;
  updateEndDate: (args: {
    contractId: string;
    entryId: string;
    segmentId: string;
    endingBefore: string;
  }) => Promise<Result<void, Error>>;
  setCarryCustomField: (args: {
    entryId: string;
    value: string;
  }) => Promise<Result<void, Error>>;
}): Promise<void> {
  const nowMs = Date.now();
  for (const entry of entries) {
    const plan = planForEntry(entry);
    if (!plan) {
      continue;
    }
    const retroactive = Date.parse(plan.carryValue) <= nowMs;

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          kind,
          entryId: entry.id,
          name: entry.name,
          contractId: plan.contractId,
          newEndingBefore: plan.carryValue,
          retroactive,
        },
        "[Backfill contract expiry] [DRY RUN] Would set one-year expiry"
      );
      continue;
    }

    let failed = false;
    for (const seg of plan.segmentUpdates) {
      const result = await updateEndDate({
        contractId: plan.contractId,
        entryId: entry.id,
        segmentId: seg.segmentId,
        endingBefore: seg.endingBefore,
      });
      if (result.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            kind,
            entryId: entry.id,
            segmentId: seg.segmentId,
            error: result.error,
          },
          "[Backfill contract expiry] Failed to update access end date"
        );
        failed = true;
        break;
      }
    }
    if (failed) {
      continue;
    }

    const carryResult = await setCarryCustomField({
      entryId: entry.id,
      value: plan.carryValue,
    });
    if (carryResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          kind,
          entryId: entry.id,
          error: carryResult.error,
        },
        "[Backfill contract expiry] Failed to update carry-on-renewal field"
      );
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        kind,
        entryId: entry.id,
        newEndingBefore: plan.carryValue,
        retroactive,
      },
      "[Backfill contract expiry] Set one-year expiry"
    );
  }
}

async function backfillForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return; // Workspace not provisioned in Metronome — skip.
  }

  const commitsResult = await listMetronomeCustomerCommits({
    metronomeCustomerId,
    includeContractCommits: true,
  });
  if (commitsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: commitsResult.error },
      "[Backfill contract expiry] Failed to list commits"
    );
  } else {
    await processEntries({
      kind: "commit",
      entries: commitsResult.value,
      workspace,
      execute,
      logger,
      updateEndDate: ({ contractId, entryId, segmentId, endingBefore }) =>
        updateAccessEndDate({
          kind: "commit",
          metronomeCustomerId,
          contractId,
          entryId,
          segmentId,
          endingBefore,
        }),
      setCarryCustomField: ({ entryId, value }) =>
        setMetronomeCommitCustomFields({
          commitId: entryId,
          customFields: { [CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY]: value },
        }),
    });
  }

  const creditsResult = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    includeContractCredits: true,
  });
  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: creditsResult.error },
      "[Backfill contract expiry] Failed to list credits"
    );
  } else {
    await processEntries({
      kind: "credit",
      entries: creditsResult.value,
      workspace,
      execute,
      logger,
      updateEndDate: ({ contractId, entryId, segmentId, endingBefore }) =>
        updateAccessEndDate({
          kind: "credit",
          metronomeCustomerId,
          contractId,
          entryId,
          segmentId,
          endingBefore,
        }),
      setCarryCustomField: ({ entryId, value }) =>
        setMetronomeContractCreditCustomFields({
          creditId: entryId,
          customFields: { [CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY]: value },
        }),
    });
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
        await backfillForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
