/**
 * Scan all workspaces with a Metronome customer and report those that have
 * more than one Metronome contract active at the time the script runs.
 *
 * Uses Metronome's `covering_date` filter (RFC 3339) to ask for contracts
 * active at a specific point in time — see the SDK's ContractListParams.
 *
 * Run with: npx tsx scripts/check_multiple_metronome_contracts.ts [-w workspaceId]
 *
 * Pass `--endDuplicates --execute` to end the oldest duplicate contract for
 * each affected workspace (keeps the most recently started one).
 */

import {
  getMetronomeClient,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function checkWorkspace(
  workspace: LightWorkspaceType,
  { endDuplicates, execute }: { endDuplicates: boolean; execute: boolean },
  logger: Logger
): Promise<void> {
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource?.metronomeCustomerId) {
    return;
  }

  const metronomeCustomerId = workspaceResource.metronomeCustomerId;
  const client = getMetronomeClient();

  const contractsResponse = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
    covering_date: new Date().toISOString(),
  });

  if (contractsResponse.data.length <= 1) {
    return;
  }

  // Sort by created_at ascending so the oldest (created first) comes first.
  // starting_at is usually identical across duplicates, so it can't be used.
  const sortedContracts = [...contractsResponse.data].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  logger.warn(
    {
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      metronomeCustomerId,
      activeContractCount: sortedContracts.length,
      contracts: sortedContracts.map((c) => ({
        id: c.id,
        createdAt: c.created_at,
        startingAt: c.starting_at,
        endingBefore: c.ending_before,
      })),
    },
    "Workspace has multiple active Metronome contracts"
  );

  if (!endDuplicates) {
    return;
  }

  // Safety conditions for ending duplicate contracts:
  //   1. The newest contract (by created_at) has no ending_before set — it is
  //      the one that should remain.
  //   2. The local active subscription points at the newest contract.
  // Older contracts get ended regardless of whether they already have an
  // ending_before set. If any condition fails, log a warning and skip.
  const newest = sortedContracts[sortedContracts.length - 1];
  const olderContracts = sortedContracts.slice(0, -1);

  if (newest.ending_before) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        newestContractId: newest.id,
        newestContractEndingBefore: newest.ending_before,
      },
      "Skipping: newest contract already has an ending_before set"
    );
    return;
  }

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspaceResource.id
  );
  const subscriptionContractId = subscription?.metronomeContractId ?? null;
  if (!subscriptionContractId) {
    logger.warn(
      { workspaceId: workspace.sId, metronomeCustomerId },
      "Skipping: no active subscription with a metronomeContractId"
    );
    return;
  }
  if (subscriptionContractId !== newest.id) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        subscriptionContractId,
        newestContractId: newest.id,
      },
      "Skipping: active subscription does not point at the newest contract"
    );
    return;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const nowMs = Date.now();
  for (const toEnd of olderContracts) {
    if (toEnd.ending_before) {
      const endsInMs = new Date(toEnd.ending_before).getTime() - nowMs;
      if (endsInMs < ONE_HOUR_MS) {
        logger.info(
          {
            workspaceId: workspace.sId,
            metronomeCustomerId,
            contractId: toEnd.id,
            endingBefore: toEnd.ending_before,
          },
          "Skipping: contract is already ending in less than an hour"
        );
        continue;
      }
    }

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          metronomeCustomerId,
          contractId: toEnd.id,
          createdAt: toEnd.created_at,
          currentEndingBefore: toEnd.ending_before,
          subscriptionContractId,
        },
        "[DRY RUN] Would end older duplicate Metronome contract immediately"
      );
      continue;
    }

    const endResult = await scheduleMetronomeContractEnd({
      metronomeCustomerId,
      contractId: toEnd.id,
    });
    if (endResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeCustomerId,
          contractId: toEnd.id,
          error: endResult.error.message,
        },
        "Failed to end older duplicate Metronome contract"
      );
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        contractId: toEnd.id,
        createdAt: toEnd.created_at,
        subscriptionContractId,
      },
      "Ended older duplicate Metronome contract"
    );
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe:
        "Workspace sId to check. Omit to check all workspaces with a Metronome customer.",
      type: "string" as const,
    },
    concurrency: {
      alias: "c",
      describe: "Number of workspaces processed in parallel.",
      type: "number" as const,
      default: 4,
    },
    endDuplicates: {
      describe:
        "End the oldest duplicate contract (the one created first). Requires --execute.",
      type: "boolean" as const,
      default: false,
    },
  },
  async (args, logger) => {
    await runOnAllWorkspaces(
      (workspace) =>
        checkWorkspace(
          workspace,
          { endDuplicates: args.endDuplicates, execute: args.execute },
          logger
        ),
      {
        concurrency: args.concurrency,
        wId: args.workspaceId,
      }
    );
  }
);
