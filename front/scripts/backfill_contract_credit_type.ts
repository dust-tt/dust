/**
 * Backfill `DUST_CONTRACT_CREDIT_TYPE` on live Metronome AWU contract credits.
 *
 * Credits are stamped reactively by the `credit.create` / `credit.segment.start`
 * webhook handlers. Metronome materializes each period of a recurring credit
 * as a separate credit with no custom fields, and sends no webhook for the
 * periods after the first, so they stay unstamped. The pool balance alert and
 * `getNetBalance` filter on DUST_CONTRACT_CREDIT_TYPE=pool, so those credits are
 * ignored by the pool balance (while Metronome still draws usage from them).
 *
 * Same rules as the webhook's `stampContractCreditType`: only AWU credits, not
 * per-seat (INDIVIDUAL) ones, "excess" for the excess-credits product and
 * "pool" otherwise. Expired credits are skipped. Idempotent — credits already
 * carrying the field are skipped.
 *
 * When a workspace gets credits stamped, its pool credit state is reconciled
 * from the live balance, so a workspace wrongly moved to `depleted` recovers.
 *
 * Run with: npx tsx scripts/backfill_contract_credit_type.ts [--execute] [--workspaceId <sId>]
 */

import { syncPoolCreditStateFromBalance } from "@app/lib/api/metronome/credit_state_dispatcher";
import {
  listMetronomeCustomerCredits,
  setMetronomeContractCreditCustomFields,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_EXCESS,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
  getProductExcessCreditsId,
} from "@app/lib/metronome/constants";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function backfillCreditsForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const creditsResult = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    includeContractCredits: true,
  });
  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: creditsResult.error },
      "[Backfill credit type] Failed to list credits"
    );
    return;
  }

  const now = new Date();
  let stampedCount = 0;
  for (const credit of creditsResult.value) {
    if (credit.custom_fields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]) {
      continue;
    }
    if (credit.access_schedule?.credit_type?.id !== getCreditTypeAwuId()) {
      continue;
    }
    if (credit.subscription_config?.allocation === "INDIVIDUAL") {
      continue;
    }
    const isExpired = (credit.access_schedule?.schedule_items ?? []).every(
      (item) => new Date(item.ending_before) <= now
    );
    if (isExpired) {
      continue;
    }

    const value =
      credit.product.id === getProductExcessCreditsId()
        ? CONTRACT_CREDIT_TYPE_EXCESS
        : CONTRACT_CREDIT_TYPE_POOL;
    const logContext = {
      workspaceId: workspace.sId,
      creditId: credit.id,
      recurringCreditId: credit.recurring_credit_id,
      name: credit.name,
      value,
    };

    if (!execute) {
      logger.info(
        logContext,
        "[Backfill credit type] [DRY RUN] Would stamp DUST_CONTRACT_CREDIT_TYPE"
      );
      continue;
    }

    const setResult = await setMetronomeContractCreditCustomFields({
      creditId: credit.id,
      customFields: { [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: value },
    });
    if (setResult.isErr()) {
      logger.error(
        { ...logContext, error: setResult.error },
        "[Backfill credit type] Failed to stamp credit"
      );
      continue;
    }
    stampedCount++;
    logger.info(logContext, "[Backfill credit type] Stamped credit");
  }

  if (stampedCount === 0) {
    return;
  }

  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    return;
  }
  await syncPoolCreditStateFromBalance({
    workspace: workspaceResource,
    metronomeCustomerId,
  });
  logger.info(
    { workspaceId: workspace.sId, stampedCount },
    "[Backfill credit type] Reconciled pool credit state from live balance"
  );
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
        await backfillCreditsForWorkspace(workspace, execute, logger);
      },
      {
        concurrency: 4,
        wId: workspaceId,
        where: { metronomeCustomerId: { [Op.ne]: null } },
      }
    );
  }
);
