/**
 * Backfill `DUST_CONTRACT_CREDIT_TYPE` on live Metronome AWU contract credits of
 * CP_ENT_* workspaces (the only plans with recurring credits).
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
 * "pool" otherwise. Only currently active credits are stamped (not expired, not
 * yet started). Idempotent — credits already carrying the field are skipped.
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
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

const CREDIT_PRICED_ENTERPRISE_PLAN_CODE_PREFIX = "CP_ENT_";

type AffectedWorkspace = {
  workspaceId: string;
  workspaceName: string;
  creditIds: string[];
  failedCreditIds: string[];
};

async function backfillCreditsForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<AffectedWorkspace | null> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return null;
  }

  // Only credit-priced enterprise contracts carry recurring pool credits.
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  const planCode = subscription?.getPlan().code ?? "";
  if (!planCode.startsWith(CREDIT_PRICED_ENTERPRISE_PLAN_CODE_PREFIX)) {
    return null;
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
    return null;
  }

  const now = new Date();
  const creditIds: string[] = [];
  const failedCreditIds: string[] = [];
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
    // Future credits are left to their `credit.segment.start` webhook.
    const isActive = (credit.access_schedule?.schedule_items ?? []).some(
      (item) =>
        new Date(item.starting_at) <= now && now < new Date(item.ending_before)
    );
    if (!isActive) {
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

    creditIds.push(credit.id);
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
      failedCreditIds.push(credit.id);
      continue;
    }
    logger.info(logContext, "[Backfill credit type] Stamped credit");
  }

  if (creditIds.length === 0) {
    return null;
  }
  const affected: AffectedWorkspace = {
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
    creditIds,
    failedCreditIds,
  };
  if (!execute || failedCreditIds.length === creditIds.length) {
    return affected;
  }

  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    return affected;
  }
  await syncPoolCreditStateFromBalance({
    workspace: workspaceResource,
    metronomeCustomerId,
  });
  logger.info(
    { workspaceId: workspace.sId },
    "[Backfill credit type] Reconciled pool credit state from live balance"
  );
  return affected;
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
    const affectedWorkspaces: AffectedWorkspace[] = [];
    await runOnAllWorkspaces(
      async (workspace) => {
        const affected = await backfillCreditsForWorkspace(
          workspace,
          execute,
          logger
        );
        if (affected) {
          affectedWorkspaces.push(affected);
        }
      },
      {
        concurrency: 4,
        wId: workspaceId,
        where: { metronomeCustomerId: { [Op.ne]: null } },
      }
    );

    logger.info(
      {
        execute,
        affectedWorkspaceCount: affectedWorkspaces.length,
        creditCount: affectedWorkspaces.reduce(
          (sum, w) => sum + w.creditIds.length,
          0
        ),
        failedCreditCount: affectedWorkspaces.reduce(
          (sum, w) => sum + w.failedCreditIds.length,
          0
        ),
        affectedWorkspaces,
      },
      execute
        ? "[Backfill credit type] Summary: workspaces with stamped credits"
        : "[Backfill credit type] [DRY RUN] Summary: workspaces with credits to stamp"
    );
  }
);
