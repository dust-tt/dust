/**
 * Recreate per-workspace Metronome balance threshold alerts so they adopt the
 * current `custom_field_filters` from the code.
 *
 * `upsertMetronomeBalanceThresholdAlert` only recreates an alert when its
 * *threshold* changes — it does not diff `custom_field_filters`. So when the
 * filters change in code (e.g. adding the per-entity Commit filter), existing
 * alerts keep the stale filters. This script archives each existing alert
 * (releasing its uniqueness key) and re-upserts it at the same threshold, which
 * recreates it with the filters the code currently emits.
 *
 * Source of truth is Metronome: the threshold is read back from the live alert,
 * so no DB lookup is needed. Workspaces without a balance threshold alert are
 * skipped.
 *
 * Run with: npx tsx scripts/recreate_pool_balance_alerts.ts [--execute] [--workspaceId <sId>]
 */

import { findMetronomeAlert } from "@app/lib/metronome/alerts";
import {
  balanceThresholdAlertUniquenessKey,
  clearMetronomeBalanceThresholdAlert,
  upsertMetronomeBalanceThresholdAlert,
} from "@app/lib/metronome/alerts/balance_threshold";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function recreateAlertForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return; // Workspace not provisioned in Metronome — skip.
  }

  const findResult = await findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: balanceThresholdAlertUniquenessKey(workspace.sId),
  });
  if (findResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: findResult.error },
      "[Recreate pool alert] Failed to find existing alert"
    );
    return;
  }
  const existing = findResult.value;
  if (!existing) {
    return; // No balance threshold alert configured — nothing to recreate.
  }

  const balanceThresholdCredits = existing.alert.threshold;
  if (
    balanceThresholdCredits === undefined ||
    balanceThresholdCredits === null
  ) {
    logger.warn(
      { workspaceId: workspace.sId, alertId: existing.alert.id },
      "[Recreate pool alert] Existing alert has no threshold, skipping"
    );
    return;
  }

  if (!execute) {
    logger.info(
      {
        workspaceId: workspace.sId,
        alertId: existing.alert.id,
        balanceThresholdCredits,
      },
      "[Recreate pool alert] [DRY RUN] Would archive and recreate alert"
    );
    return;
  }

  const clearResult = await clearMetronomeBalanceThresholdAlert({
    metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  if (clearResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: clearResult.error },
      "[Recreate pool alert] Failed to archive existing alert"
    );
    return;
  }

  const upsertResult = await upsertMetronomeBalanceThresholdAlert({
    metronomeCustomerId,
    balanceThresholdCredits,
    workspaceId: workspace.sId,
  });
  if (upsertResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: upsertResult.error },
      "[Recreate pool alert] Failed to recreate alert"
    );
    return;
  }
  logger.info(
    {
      workspaceId: workspace.sId,
      alertId: upsertResult.value.alertId,
      balanceThresholdCredits,
    },
    "[Recreate pool alert] Recreated alert with current filter"
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
        await recreateAlertForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
