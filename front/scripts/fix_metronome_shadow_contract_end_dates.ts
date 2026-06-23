/**
 * Sync Metronome shadow contract end dates with subscription end dates.
 *
 * A shadow contract is a subscription that has both a stripeSubscriptionId
 * (Stripe handles billing) and a metronomeContractId (Metronome runs in
 * parallel for invoice validation). When such a subscription ends, the
 * Metronome contract should have an ending_before matching the subscription's
 * endDate (ceiled to the nearest hour, as Metronome requires).
 *
 * This script finds all ended shadow subscriptions and fixes any mismatch.
 *
 * Run with:
 *   npx tsx scripts/fix_metronome_shadow_contract_end_dates.ts [--execute]
 */

import {
  ceilToHourISO,
  getMetronomeContractById,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import { SubscriptionModel } from "@app/lib/models/plan";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { Op } from "sequelize";

import { makeScript } from "./helpers";

makeScript({}, async ({ execute }, scriptLogger) => {
  // Fetch all ended shadow subscriptions across all workspaces.
  // Shadow = has both stripeSubscriptionId and metronomeContractId.
  const subscriptions = await SubscriptionModel.findAll({
    where: {
      status: { [Op.in]: ["ended", "ended_backend_only"] },
      metronomeContractId: { [Op.not]: null },
      stripeSubscriptionId: { [Op.not]: null },
      endDate: { [Op.not]: null },
    },
    attributes: [
      "sId",
      "workspaceId",
      "metronomeContractId",
      "stripeSubscriptionId",
      "endDate",
      "status",
    ],
    // WORKSPACE_ISOLATION_BYPASS: Admin script scanning all workspaces to fix
    // Metronome shadow contract end dates.
    // @ts-expect-error -- Script operates across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  if (subscriptions.length === 0) {
    scriptLogger.info(
      "[ShadowContractSync] No ended shadow subscriptions found."
    );
    return;
  }

  scriptLogger.info(
    { count: subscriptions.length },
    "[ShadowContractSync] Found ended shadow subscriptions to check."
  );

  // Batch-fetch workspaces in a single query — one workspace per unique workspaceId.
  const workspaceModelIds = [
    ...new Set(subscriptions.map((s) => s.workspaceId)),
  ];
  const workspaces = await WorkspaceModel.findAll({
    where: { id: { [Op.in]: workspaceModelIds } },
    attributes: ["id", "sId", "metronomeCustomerId"],
  });
  const workspaceByModelId = new Map(workspaces.map((w) => [w.id, w]));

  let checked = 0;
  let mismatched = 0;
  let fixed = 0;
  let errors = 0;

  for (const sub of subscriptions) {
    checked++;

    const workspace = workspaceByModelId.get(sub.workspaceId);
    if (!workspace?.metronomeCustomerId) {
      scriptLogger.warn(
        { workspaceModelId: sub.workspaceId, subscriptionId: sub.sId },
        "[ShadowContractSync] Workspace has no metronomeCustomerId, skipping."
      );
      continue;
    }

    const contractResult = await getMetronomeContractById({
      metronomeCustomerId: workspace.metronomeCustomerId,
      // metronomeContractId guaranteed non-null by the query filter.
      metronomeContractId: sub.metronomeContractId as string,
    });

    if (contractResult.isErr()) {
      scriptLogger.error(
        {
          workspaceId: workspace.sId,
          subscriptionId: sub.sId,
          metronomeContractId: sub.metronomeContractId,
          error: contractResult.error.message,
        },
        "[ShadowContractSync] Failed to fetch Metronome contract."
      );
      errors++;
      continue;
    }

    const contract = contractResult.value;

    // Only fix contracts that have no end date at all. If Metronome already
    // has an ending_before set (even at a different hour boundary), the
    // contract is effectively closed and nothing needs to be changed.
    if (contract.ending_before) {
      continue;
    }

    mismatched++;
    // endDate is guaranteed non-null by the query filter.
    const expectedEndingBefore = ceilToHourISO(sub.endDate as Date);
    scriptLogger.info(
      {
        workspaceId: workspace.sId,
        subscriptionId: sub.sId,
        metronomeContractId: sub.metronomeContractId,
        subscriptionEndDate: (sub.endDate as Date).toISOString(),
        expectedEndingBefore,
      },
      "[ShadowContractSync] Contract has no ending_before — will set end date."
    );

    if (!execute) {
      continue;
    }

    const updateResult = await scheduleMetronomeContractEnd({
      metronomeCustomerId: workspace.metronomeCustomerId,
      contractId: sub.metronomeContractId as string,
      endingBefore: sub.endDate as Date, // ceilToHourISO applied inside scheduleMetronomeContractEnd
    });

    if (updateResult.isErr()) {
      scriptLogger.error(
        {
          workspaceId: workspace.sId,
          subscriptionId: sub.sId,
          metronomeContractId: sub.metronomeContractId,
          error: updateResult.error.message,
        },
        "[ShadowContractSync] Failed to update Metronome contract end date."
      );
      errors++;
    } else {
      fixed++;
    }
  }

  scriptLogger.info(
    { checked, mismatched, fixed, errors, dryRun: !execute },
    "[ShadowContractSync] Done."
  );
});
