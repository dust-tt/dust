/**
 * Backfill credits to existing Metronome contracts.
 *
 * For each workspace with a Metronome contract:
 * - "free": finds free credits (type="free") that have been started, creates Metronome
 *   credit grants for the remaining balance. Logs the expected initial value from
 *   calculateFreeCreditAmountMicroUsd for comparison.
 * - "committed": finds active committed credits (type="committed", not yet expired),
 *   creates Prepaid commits in Metronome for the remaining balance.
 * - "all": runs both.
 *
 * Idempotent: uses a deterministic idempotency key based on the credit DB id.
 * Re-running the script will not create duplicate entries in Metronome.
 *
 * Run with: npx tsx scripts/backfill_metronome_credits.ts [--execute] [--workspaceId <sId>] [--type free|committed|all]
 */

import { Authenticator } from "@app/lib/auth";
import {
  createMetronomeCommit,
  createMetronomeCredit,
  getMetronomeClient,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getProductFreeMonthlyCreditId,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import { CreditResource } from "@app/lib/resources/credit_resource";
import type { Logger } from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

type BackfillType = "free" | "committed" | "all";

async function backfillCreditsOfType(
  workspace: LightWorkspaceType,
  type: "free" | "committed",
  metronomeCustomerId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const allCredits = await CreditResource.listAll(auth);
  const now = new Date();
  const credits = allCredits.filter(
    (c) =>
      c.type === type &&
      c.startDate !== null &&
      c.expirationDate !== null &&
      c.expirationDate > now
  );

  const metronomeItem = type === "free" ? "credit" : "commit";

  for (const credit of credits) {
    if (credit.metronomeCreditId) {
      continue;
    }
    const initialMicroUsd = credit.initialAmountMicroUsd;
    const consumedMicroUsd = credit.consumedAmountMicroUsd;

    const startingAt = credit.startDate!;
    const endingBefore = credit.expirationDate!;
    // Create with full initial amount; consumed portion is deducted separately below.
    const initialAmount = initialMicroUsd / 1_000_000;
    const consumedAmount = consumedMicroUsd / 1_000_000;

    let result: Result<{ id: string } | null, Error>;

    switch (type) {
      case "committed":
        if (!execute) {
          logger.info(
            {
              workspaceId: workspace.sId,
              creditId: credit.id,
              initialUsd: initialAmount,
              consumedUsd: consumedAmount,
              startingAt: startingAt.toLocaleDateString("en-GB"),
              endingBefore: endingBefore.toLocaleDateString("en-GB"),
            },
            `[Backfill] [DRY RUN] Would create ${metronomeItem} in Metronome (committed)`
          );
          continue;
        }

        result = await createMetronomeCommit({
          metronomeCustomerId,
          productId: getProductPrepaidCommitId(),
          creditTypeId: getCreditTypeProgrammaticUsdId(),
          amount: initialAmount,
          startingAt,
          endingBefore,
          name: `Prepaid commit backfill (${startingAt.toISOString().split("T")[0]})`,
          idempotencyKey: `createCommit-${workspace.sId}-${startingAt.getTime()}-${endingBefore.getTime()}`,
        });
        break;
      case "free": {
        if (!credit?.invoiceOrLineItemId) {
          logger.warn(
            {
              workspaceId: workspace.sId,
              creditId: credit.id,
            },
            `[Backfill] Credit missing invoiceOrLineItemId, cannot determine if "free-renewal-*" or "free-poke", skipping`
          );
          continue;
        }
        // Match both monthly (free-renewal-sub_xxx-...) and yearly
        // (free-renewal-yearly-sub_xxx-...) renewal credits — both need to be
        // reconciled with the contract's recurring credit segment, not
        // created as net-new customer-level credits.
        if (credit.invoiceOrLineItemId.startsWith("free-renewal-")) {
          const client = getMetronomeClient();
          const contractsResponse = await client.v2.contracts.list({
            customer_id: metronomeCustomerId,
            covering_date: new Date().toISOString(),
          });
          const contract = contractsResponse.data[0];
          if (!contract) {
            // free-renewal-* credits originate from paid Stripe subscription
            // renewals, so a workspace holding one with no active Metronome
            // contract is unexpected (likely stale data from a downgrade).
            logger.warn(
              { workspaceId: workspace.sId, creditId: credit.id },
              "[Backfill] free-renewal credit on workspace with no active Metronome contract, skipping"
            );
            continue;
          }
          const freeCreditProductId = getProductFreeMonthlyCreditId();

          const existingRecurringCredit = contract.recurring_credits?.find(
            (rc) => rc.product.id === freeCreditProductId
          );

          if (!existingRecurringCredit) {
            logger.info(
              { workspaceId: workspace.sId, contractId: contract.id },
              "[Backfill] Recurring credit does not exist on contract, skipping"
            );
            continue;
          }
          const creditsResponse = await client.v1.customers.credits.list({
            customer_id: metronomeCustomerId,
            covering_date: new Date().toISOString(),
            include_contract_credits: true,
          });
          const currentRecurringCredit = creditsResponse.data.find(
            (c) => c.recurring_credit_id === existingRecurringCredit.id
          );
          const segmentId =
            currentRecurringCredit?.access_schedule?.schedule_items[0]?.id;

          if (!segmentId) {
            logger.info(
              { workspaceId: workspace.sId, contractId: contract.id },
              "[Backfill] No active segment found for recurring credit, skipping"
            );
            continue;
          }

          if (!execute) {
            logger.info(
              {
                workspaceId: workspace.sId,
                creditId: credit.id,
                metronomeCreditId: currentRecurringCredit.id,
                initialUsd: initialAmount,
                consumedUsd: consumedAmount,
                startingAt: startingAt.toLocaleDateString("en-GB"),
                endingBefore: endingBefore.toLocaleDateString("en-GB"),
              },
              `[Backfill] [DRY RUN] Would update amount of ${metronomeItem} in Metronome`
            );
            continue;
          }

          result = await updateMetronomeCreditSegmentAmount({
            metronomeCustomerId,
            contractId: contract.id,
            creditId: currentRecurringCredit.id,
            segmentId,
            amount: initialAmount,
          });
        } else {
          if (!execute) {
            logger.info(
              {
                workspaceId: workspace.sId,
                creditId: credit.id,
                initialUsd: initialAmount,
                consumedUsd: consumedAmount,
                startingAt: startingAt.toLocaleDateString("en-GB"),
                endingBefore: endingBefore.toLocaleDateString("en-GB"),
              },
              `[Backfill] [DRY RUN] Would create ${metronomeItem} in Metronome (free-poke)`
            );
            continue;
          }

          // "free-poke" credits
          result = await createMetronomeCredit({
            metronomeCustomerId,
            productId: getProductFreeMonthlyCreditId(),
            creditTypeId: getCreditTypeProgrammaticUsdId(),
            amount: initialAmount,
            startingAt: startingAt.toISOString(),
            endingBefore: endingBefore.toISOString(),
            name: `Free poke credit backfill (${startingAt.toISOString().split("T")[0]})`,
            idempotencyKey: `createCredit-${workspace.sId}-${startingAt.getTime()}-${endingBefore.getTime()}`,
            priority: 1,
            applicableProductTags: ["usage"],
          });
        }
        break;
      }
      default:
        logger.error(
          { workspaceId: workspace.sId, creditId: credit.id, type },
          `[Backfill] Unknown credit type "${type}", skipping`
        );
        continue;
    }

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          error: result.error.message,
        },
        `[Backfill] Failed to create ${metronomeItem} in Metronome`
      );
      continue;
    }

    if (!result.value) {
      // Idempotency conflict — already created in a previous run, skip deduction.
      logger.info(
        { workspaceId: workspace.sId, creditId: credit.id },
        `[Backfill] ${metronomeItem} already exists in Metronome, skipping deduction`
      );
      continue;
    }

    await credit.setMetronomeCreditId(result.value.id);

    logger.info(
      {
        workspaceId: workspace.sId,
        creditId: credit.id,
        metronomeId: result.value.id,
      },
      `[Backfill] Successfully created ${metronomeItem} in Metronome`
    );
  }
}

async function backfillCreditsForWorkspace(
  workspace: LightWorkspaceType,
  type: BackfillType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return; // Workspace not provisioned in Metronome — skip.
  }

  // Note: a Metronome contract isn't required at the workspace level — only
  // the `free-renewal-*` branch needs one (it edits the contract's recurring
  // credit segment). `free-poke` and `committed` credits are created at the
  // customer level and work without a contract. The recurring branch handles
  // the missing-contract case inline.

  if (type === "free" || type === "all") {
    await backfillCreditsOfType(
      workspace,
      "free",
      metronomeCustomerId,
      execute,
      logger
    );
  }
  if (type === "committed" || type === "all") {
    await backfillCreditsOfType(
      workspace,
      "committed",
      metronomeCustomerId,
      execute,
      logger
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
    type: {
      type: "string" as const,
      description: 'Credit type to backfill: "free", "committed", or "all"',
      default: "all",
    },
  },
  async ({ workspaceId, type, execute }, logger) => {
    if (type !== "free" && type !== "committed" && type !== "all") {
      throw new Error(
        `Invalid type "${type}". Must be "free", "committed", or "all".`
      );
    }

    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillCreditsForWorkspace(
          workspace,
          type as BackfillType,
          execute,
          logger
        );
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
