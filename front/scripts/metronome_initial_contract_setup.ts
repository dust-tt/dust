/**
 * Backfill a recurring $0 credit to existing Metronome contracts.
 *
 * For each workspace with a Metronome customer ID, lists all active contracts
 * directly from Metronome and adds a monthly recurring credit with $0 amount
 * using the Free Monthly Credits product. The credit amount is expected to be
 * updated each billing period via the credit.segment.start webhook
 * (see updateMetronomeCreditSegmentAmount).
 *
 * Idempotent: checks whether a recurring credit with the Free Monthly Credits
 * product already exists on each contract before adding one.
 * Re-running the script will not create duplicate entries.
 *
 * Run with: npx tsx scripts/backfill_metronome_recurring_credits.ts [--execute] [--workspaceId <sId>]
 */

import { floorToHourISO, getMetronomeClient } from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getProductFreeCreditId,
  getProductProgrammaticUsageId,
} from "@app/lib/metronome/constants";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function backfillRecurringCreditForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return; // Workspace not provisioned in Metronome — skip.
  }

  const client = getMetronomeClient();

  // List all contracts for this customer directly from Metronome.
  let contracts;
  try {
    const contractsResponse = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });
    contracts = contractsResponse.data;
  } catch (err) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        error: normalizeError(err).message,
      },
      "[Backfill] Failed to list contracts from Metronome"
    );
    return;
  }

  const freeCreditProductId = getProductFreeCreditId();
  const creditTypeId = getCreditTypeProgrammaticUsdId();
  const programmaticUsageProductId = getProductProgrammaticUsageId();

  for (const contract of contracts) {
    const contractId = contract.id;
    const startingAt = floorToHourISO(new Date(contract.starting_at));

    // --- Check 1: recurring free credit ---

    const existingCreditProductIds = new Set(
      (contract.recurring_credits ?? []).map((c) => c.product.id)
    );

    if (existingCreditProductIds.has(freeCreditProductId)) {
      logger.info(
        { workspaceId: workspace.sId, contractId },
        "[Backfill] Recurring credit already exists on contract, skipping"
      );
    } else {
      const recurringCredit = {
        product_id: freeCreditProductId,
        name: "Free Monthly Credits",
        starting_at: startingAt,
        priority: 1, // Apply before prepaid commits.
        access_amount: {
          credit_type_id: creditTypeId,
          unit_price: 0,
          quantity: 1,
        },
        commit_duration: { value: 1, unit: "PERIODS" as const },
        recurrence_frequency: "MONTHLY" as const,
        applicable_product_tags: ["usage"],
      };

      if (!execute) {
        logger.info(
          { workspaceId: workspace.sId, contractId, recurringCredit },
          "[Backfill] [DRY RUN] Would add recurring credit to contract"
        );
      } else {
        try {
          await client.v2.contracts.edit({
            customer_id: metronomeCustomerId,
            contract_id: contractId,
            add_recurring_credits: [recurringCredit],
          });
          logger.info(
            { workspaceId: workspace.sId, contractId },
            "[Backfill] Successfully added recurring credit to contract"
          );
        } catch (err) {
          logger.error(
            {
              workspaceId: workspace.sId,
              contractId,
              error: normalizeError(err).message,
            },
            "[Backfill] Failed to add recurring credit to contract"
          );
        }
      }
    }

    // --- Check 2: Programmatic Usage product rate ---

    const isProgrammaticUsageEnabled = (contract.overrides ?? []).some(
      (override) =>
        override.entitled === true &&
        (override.override_specifiers ?? []).some(
          (spec) => spec.product_id === programmaticUsageProductId
        )
    );

    if (isProgrammaticUsageEnabled) {
      logger.info(
        { workspaceId: workspace.sId, contractId },
        "[Backfill] Programmatic Usage rate already enabled on contract, skipping"
      );
    } else if (!execute) {
      logger.info(
        { workspaceId: workspace.sId, contractId },
        "[Backfill] [DRY RUN] Would add override to enable Programmatic Usage rate"
      );
    } else {
      try {
        await client.v2.contracts.edit({
          customer_id: metronomeCustomerId,
          contract_id: contractId,
          add_overrides: [
            {
              starting_at: startingAt,
              product_id: programmaticUsageProductId,
              entitled: true,
            },
          ],
        });
        logger.info(
          { workspaceId: workspace.sId, contractId },
          "[Backfill] Successfully added override to enable Programmatic Usage rate"
        );
      } catch (err) {
        logger.error(
          {
            workspaceId: workspace.sId,
            contractId,
            error: normalizeError(err).message,
          },
          "[Backfill] Failed to add override to enable Programmatic Usage rate"
        );
      }
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
  },
  async ({ workspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillRecurringCreditForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
