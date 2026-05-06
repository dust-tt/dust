/**
 * Remove duplicated free-renewal / free-renewal-yearly credits in the DB.
 *
 * Duplicates are detected by grouping free credits whose invoiceOrLineItemId
 * starts with "free-renewal-" by (subtype, startDate, expirationDate).
 * Any group with 2+ credits is a duplicate set.
 *
 * For each duplicate set:
 * - Fetches the current recurring credit from Metronome (active at the group's start date).
 * - Elects one surviving credit (the one with the most consumed amount).
 * - If 2+ credits have consumed > 0, logs a warning and sums all consumed amounts.
 * - Updates the survivor's startDate, expirationDate, initialAmountMicroUsd, metronomeCreditId,
 *   and invoiceOrLineItemId from the Metronome credit.
 * - Deletes all other duplicates.
 *
 * Idempotent when run in dry-run mode. Pass --execute to apply changes.
 *
 * Run with: npx tsx scripts/remove_duplicated_credits.ts [--execute] [--workspaceId <sId>]
 */

import { Authenticator } from "@app/lib/auth";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { getProductFreeCreditId } from "@app/lib/metronome/constants";
import { METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD } from "@app/lib/metronome/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function removeDuplicatedCredits(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const allCredits = await CreditResource.listAll(auth);
  const renewalCredits = allCredits.filter(
    (c) =>
      c.type === "free" &&
      c.invoiceOrLineItemId !== null &&
      c.invoiceOrLineItemId.startsWith("free-renewal-")
  );

  if (renewalCredits.length === 0) {
    return;
  }

  // Group by (subtype, startDate, expirationDate).
  const groups = new Map<string, typeof renewalCredits>();
  for (const credit of renewalCredits) {
    const key = `${credit.startDate!.toISOString().split("T")[0]}`;
    const group = groups.get(key) ?? [];
    group.push(credit);
    groups.set(key, group);
  }

  // Process only groups with duplicates.
  for (const [groupKey, duplicates] of groups) {
    if (duplicates.length < 2) {
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        groupKey,
        count: duplicates.length,
        creditIds: duplicates.map((c) => c.id),
      },
      "[Remove Duplicates] Found duplicate group"
    );

    // Fetch the active contract covering this group's start date.
    const representativeStartDate = duplicates[0].startDate!;
    const client = getMetronomeClient();

    const contractsResponse = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
      covering_date: new Date().toISOString(),
    });
    const contracts = contractsResponse.data;
    if (contracts.length > 1) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          groupKey,
          metronomeCustomerId,
          contractCount: contracts.length,
          contractIds: contracts.map((c) => c.id),
        },
        "[Remove Duplicates] Multiple active Metronome contracts for one customer (should not happen), skipping group"
      );
      continue;
    }
    const contract = contractsResponse.data[0];

    if (!contract) {
      logger.warn(
        { workspaceId: workspace.sId, groupKey },
        "[Remove Duplicates] No active Metronome contract found, skipping group"
      );
      continue;
    }

    const freeCreditProductId = getProductFreeCreditId();
    const recurringCredit = contract.recurring_credits?.find(
      (rc) => rc.product.id === freeCreditProductId
    );

    if (!recurringCredit) {
      logger.warn(
        { workspaceId: workspace.sId, groupKey, contractId: contract.id },
        "[Remove Duplicates] No recurring credit on contract, skipping group"
      );
      continue;
    }

    // Find the current credit instance generated from the recurring credit.
    const creditsResponse = await client.v1.customers.credits.list({
      customer_id: metronomeCustomerId,
      covering_date: representativeStartDate.toISOString(),
      include_contract_credits: true,
      include_balance: true,
    });

    const metronomeEntry = creditsResponse.data.find(
      (c) => c.recurring_credit_id === recurringCredit.id
    );

    if (!metronomeEntry) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          groupKey,
          recurringCreditId: recurringCredit.id,
        },
        "[Remove Duplicates] No active credit instance for recurring credit, skipping group"
      );
      continue;
    }

    const contractId = contract.id;
    const item = metronomeEntry.access_schedule!.schedule_items![0];
    const metronomeStartDate = new Date(item.starting_at);
    const metronomeExpirationDate = new Date(item.ending_before);
    const metronomeInitialAmountMicroUsd = Math.round(
      item.amount * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD
    );

    const periodStartSeconds = Math.floor(metronomeStartDate.getTime() / 1000);
    const isYearly = recurringCredit.recurrence_frequency === "ANNUAL";
    const correctInvoiceOrLineItemId = isYearly
      ? `free-renewal-yearly-${contractId}-${periodStartSeconds}`
      : `free-renewal-${contractId}-${periodStartSeconds}`;

    // Elect the surviving credit.
    const withConsumed = duplicates.filter((c) => c.consumedAmountMicroUsd > 0);

    if (withConsumed.length > 1) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          groupKey,
          consumedCreditIds: withConsumed.map((c) => ({
            id: c.id,
            consumedMicroUsd: c.consumedAmountMicroUsd,
          })),
        },
        "[Remove Duplicates] Multiple duplicates have consumed amount > 0"
      );
    }

    // Survivor: among credits with consumed > 0 pick the one with the most initial amount
    const sorted = [...duplicates].sort(
      (a, b) => b.initialAmountMicroUsd - a.initialAmountMicroUsd
    );
    const survivor = sorted[0];
    const toDelete = sorted.slice(1);

    const totalConsumedAmountMicroUsd = duplicates.reduce(
      (sum, c) => sum + c.consumedAmountMicroUsd,
      0
    );

    if (totalConsumedAmountMicroUsd > survivor.initialAmountMicroUsd) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          groupKey,
          survivorId: survivor.id,
          survivorInitialAmountMicroUsd: survivor.initialAmountMicroUsd,
          totalConsumedAmountMicroUsd,
        },
        "[Remove Duplicates] Total consumed exceeds survivor's initial amount, skipping group"
      );
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        groupKey,
        survivorId: survivor.id,
        survivorConsumedMicroUsd: survivor.consumedAmountMicroUsd,
        totalConsumedMicroUsd: totalConsumedAmountMicroUsd,
        toDeleteIds: toDelete.map((c) => c.id),
        metronomeId: metronomeEntry.id,
        metronomeStartDate: metronomeStartDate.toISOString(),
        metronomeExpirationDate: metronomeExpirationDate.toISOString(),
        metronomeInitialAmountUsd: metronomeInitialAmountMicroUsd / 1_000_000,
        correctInvoiceOrLineItemId,
      },
      execute
        ? "[Remove Duplicates] Removing duplicates and updating survivor"
        : "[Remove Duplicates] [DRY RUN] Would remove duplicates and update survivor"
    );

    if (!execute) {
      continue;
    }

    // Delete non-surviving duplicates first.
    for (const dup of toDelete) {
      const result = await dup.delete(auth);
      if (result.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            creditId: dup.id,
            error: result.error.message,
          },
          "[Remove Duplicates] Failed to delete duplicate credit"
        );
      } else {
        logger.info(
          { workspaceId: workspace.sId, creditId: dup.id },
          "[Remove Duplicates] Deleted duplicate credit"
        );
      }
    }

    // Update the survivor with values from Metronome.
    try {
      await CreditModel.update(
        {
          startDate: metronomeStartDate,
          expirationDate: metronomeExpirationDate,
          initialAmountMicroUsd: metronomeInitialAmountMicroUsd,
          consumedAmountMicroUsd: totalConsumedAmountMicroUsd,
          metronomeCreditId: metronomeEntry.id,
          invoiceOrLineItemId: correctInvoiceOrLineItemId,
        },
        { where: { id: survivor.id } }
      );

      logger.info(
        { workspaceId: workspace.sId, creditId: survivor.id },
        "[Remove Duplicates] Updated survivor credit"
      );
    } catch (error) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: survivor.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "[Remove Duplicates] Failed to update survivor credit"
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
        await removeDuplicatedCredits(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId, fromWorkspaceId }
    );
  }
);
