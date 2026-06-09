/**
 * Backfill `DUST_CONTRACT_CREDIT_TYPE=pool` on existing Metronome AWU commits.
 *
 * New commits get tagged reactively by the `commit.create` /
 * `commit.segment.start` webhook handlers, but commits created before that
 * landed have no tag. The pool balance alert carries a Commit filter on
 * DUST_CONTRACT_CREDIT_TYPE=pool (same key as the ContractCredit filter, as
 * Metronome requires), so an untagged AWU commit is excluded from the balance —
 * exactly the early-firing bug the tag fixes. This stamps them so they count.
 *
 * Only AWU commits are tagged: commits of other credit types (e.g. programmatic
 * USD) belong to different pools and are left untouched. Idempotent — commits
 * already carrying the field are skipped.
 *
 * IMPORTANT: run this BEFORE recreating the alerts with the Commit filter
 * (`recreate_pool_balance_alerts.ts` + `metronome_setup.ts --recreate-pool-defaults`).
 * Adding the filter first would drop these untagged commits from the balance
 * until the backfill catches up.
 *
 * Run with: npx tsx scripts/backfill_commit_credit_type.ts [--execute] [--workspaceId <sId>]
 */

import {
  listMetronomeCustomerCommits,
  setMetronomeCommitCustomFields,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function backfillCommitsForWorkspace(
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
      "[Backfill commit type] Failed to list commits"
    );
    return;
  }

  const awuCreditTypeId = getCreditTypeAwuId();
  for (const commit of commitsResult.value) {
    if (commit.custom_fields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]) {
      continue;
    }
    if (commit.access_schedule?.credit_type?.id !== awuCreditTypeId) {
      continue;
    }

    if (!execute) {
      logger.info(
        { workspaceId: workspace.sId, commitId: commit.id, name: commit.name },
        "[Backfill commit type] [DRY RUN] Would stamp DUST_CONTRACT_CREDIT_TYPE=pool"
      );
      continue;
    }

    const setResult = await setMetronomeCommitCustomFields({
      commitId: commit.id,
      customFields: {
        [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: CONTRACT_CREDIT_TYPE_POOL,
      },
    });
    if (setResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          commitId: commit.id,
          error: setResult.error,
        },
        "[Backfill commit type] Failed to stamp commit"
      );
      continue;
    }
    logger.info(
      { workspaceId: workspace.sId, commitId: commit.id },
      "[Backfill commit type] Stamped DUST_CONTRACT_CREDIT_TYPE=pool"
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
  },
  async ({ workspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillCommitsForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
