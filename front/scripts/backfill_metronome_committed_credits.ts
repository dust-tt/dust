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
 * Run with: npx tsx scripts/backfill_metronome_committed_credits.ts [--execute] [--workspaceId <sId>] [--type free|committed|all]
 */

import { Authenticator } from "@app/lib/auth";
import {
  createMetronomeCommit,
  createMetronomeCredit,
} from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getProductFreeMonthlyCreditId,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
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

  if (credits.length === 0) {
    return;
  }

  let totalAmountMicroUsd = 0;
  const metronomeItem = type === "free" ? "credit" : "commit";

  for (const credit of credits) {
    const remainingMicroUsd =
      credit.initialAmountMicroUsd - credit.consumedAmountMicroUsd;
    if (remainingMicroUsd < 0) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          initialMicroUsd: credit.initialAmountMicroUsd,
          consumedMicroUsd: credit.consumedAmountMicroUsd,
        },
        `[Backfill] Negative remaining balance for ${metronomeItem}, skipping`
      );
      continue;
    }
    const startingAt = credit.startDate!;
    const endingBefore = credit.expirationDate!;
    const amount = remainingMicroUsd / 1_000_000;
    const idempotencyKey = `backfill-metronome-${metronomeItem}-${workspace.sId}-${credit.id}`;

    totalAmountMicroUsd += remainingMicroUsd;

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          initialMicroUsd: credit.initialAmountMicroUsd,
          consumedMicroUsd: credit.consumedAmountMicroUsd,
          remainingMicroUsd,
          amount,
          startingAt,
          endingBefore,
          idempotencyKey,
        },
        `[Backfill] [DRY RUN] Would create ${metronomeItem} in Metronome`
      );
      continue;
    }

    const result =
      type === "free"
        ? await createMetronomeCredit({
            metronomeCustomerId,
            productId: getProductFreeMonthlyCreditId(),
            creditTypeId: getCreditTypeProgrammaticUsdId(),
            amount,
            startingAt: startingAt.toISOString(),
            endingBefore: endingBefore.toISOString(),
            name: `Monthly credit backfill (${startingAt.toISOString().split("T")[0]})`,
            idempotencyKey,
          })
        : await createMetronomeCommit({
            metronomeCustomerId,
            productId: getProductPrepaidCommitId(),
            creditTypeId: getCreditTypeProgrammaticUsdId(),
            amount,
            startingAt,
            endingBefore,
            name: `Prepaid commit backfill (${startingAt.toISOString().split("T")[0]})`,
            idempotencyKey,
          });

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          creditId: credit.id,
          error: result.error.message,
        },
        "[Backfill] Failed to create commit in Metronome"
      );
    } else {
      logger.info(
        { workspaceId: workspace.sId, creditId: credit.id },
        `[Backfill] Successfully created ${metronomeItem} in Metronome`
      );
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      committedCreditsCount: credits.length,
      totalAmountUsd: totalAmountMicroUsd / 1_000_000,
    },
    execute
      ? `[Backfill] Done processing ${metronomeItem}s`
      : `[Backfill] [DRY RUN] Would add ${metronomeItem}s for workspace`
  );
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

  // Check active subscription has a Metronome contract.
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return;
  }

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
