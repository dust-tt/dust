/**
 * For each workspace listed in churn.txt:
 * 1. List contracts from Metronome and find those without an end date.
 * 2. For each such contract, look up the matching subscription by metronomeContractId.
 * 3. If the subscription has an endDate, set it as ending_before on the Metronome contract.
 * 4. Otherwise, warn — we cannot determine when the contract should end.
 *
 * Run with:
 *   npx tsx scripts/fix_metronome_contract_end_date_for_churned_workspaces.ts [--execute]
 *
 * Without --execute, runs in dry-run mode and logs what would change.
 */

import {
  listMetronomeContracts,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import { PlanModel } from "@app/lib/models/plan";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { readFileSync } from "fs";
import * as path from "path";
import { makeScript } from "./helpers";

const CHURN_FILE = path.resolve(__dirname, "churn.txt");

async function fixContractEndDate(
  workspaceId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const workspaceLogger = logger.child({ workspaceId });

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    workspaceLogger.warn("Workspace not found, skipping.");
    return;
  }

  if (!workspace.metronomeCustomerId) {
    workspaceLogger.info("No Metronome customer, skipping.");
    return;
  }

  const metronomeCustomerId = workspace.metronomeCustomerId;

  const contractsResult = await listMetronomeContracts(metronomeCustomerId);
  if (contractsResult.isErr()) {
    workspaceLogger.error(
      { error: contractsResult.error.message },
      "Failed to list Metronome contracts, skipping."
    );
    return;
  }

  // Only process contracts that have no end date set yet.
  const openContracts = contractsResult.value.filter((c) => !c.ending_before);
  if (openContracts.length === 0) {
    workspaceLogger.info("All Metronome contracts already have an end date.");
    return;
  }

  // Fetch all subscriptions for this workspace once to avoid one DB query per contract.
  const allSubscriptions = await SubscriptionResource.model.findAll({
    where: { workspaceId: workspace.id },
    include: [PlanModel],
  });
  const subscriptionByContractId = new Map(
    allSubscriptions
      .filter((s) => s.metronomeContractId)
      .map((s) => [s.metronomeContractId as string, s])
  );

  for (const contract of openContracts) {
    const contractLogger = workspaceLogger.child({ contractId: contract.id });

    const subscription = subscriptionByContractId.get(contract.id);

    if (!subscription) {
      contractLogger.warn(
        "No matching subscription found for contract, skipping."
      );
      continue;
    }

    if (!subscription.endDate) {
      contractLogger.warn(
        {
          subscriptionSId: subscription.sId,
          subscriptionStatus: subscription.status,
        },
        "Subscription has no endDate — cannot determine contract end date."
      );
      continue;
    }

    contractLogger.info(
      {
        subscriptionSId: subscription.sId,
        newEndingBefore: subscription.endDate.toISOString(),
        execute,
      },
      `${execute ? "" : "[DRYRUN] "}Setting Metronome contract end date`
    );

    if (!execute) {
      continue;
    }

    const result = await scheduleMetronomeContractEnd({
      metronomeCustomerId,
      contractId: contract.id,
      endingBefore: subscription.endDate,
    });

    if (result.isErr()) {
      contractLogger.error(
        { error: result.error.message },
        "Failed to update Metronome contract end date."
      );
      continue;
    }

    contractLogger.info(
      { endingBefore: subscription.endDate.toISOString() },
      "Metronome contract end date updated."
    );
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe:
        "Single workspace sId to process. Omit to process all workspaces in churn.txt.",
      type: "string" as const,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    const workspaceSIds = workspaceId
      ? [workspaceId]
      : readFileSync(CHURN_FILE, "utf-8")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

    logger.info(
      { count: workspaceSIds.length },
      "Processing churned workspaces"
    );

    for (const workspaceId of workspaceSIds) {
      await fixContractEndDate(workspaceId, execute, logger);
    }

    logger.info("Done.");
  }
);
