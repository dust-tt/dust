/**
 * One-off cleanup: archive the Metronome spend-cap alerts that are no longer
 * used for enforcement.
 *
 * Per-user, per-API-key and programmatic spend caps are now enforced from Redis
 * fixed-window rate-limiter counters compared against DB-persisted cap values
 * (membership pool-cap overrides, `credit_usage_configurations`, group caps) and
 * Metronome seat pricing. The `spend_threshold_reached` alerts we used to create
 * to drive webhook enforcement — per-user cap/warning, per-seat-type default
 * cap/warning, per-group cap/warning, and the four programmatic cap alerts — no
 * longer feed anything, so this archives them.
 *
 * It does NOT touch the free-seat per-user credit-balance alerts
 * (`per-user-credit-*`) or the workspace balance-threshold alert
 * (`workspace-balance-threshold-*`), which are still in use.
 *
 * Usage:
 *   npx tsx scripts/archive_unused_spend_cap_alerts.ts            # dry run
 *   npx tsx scripts/archive_unused_spend_cap_alerts.ts --execute  # apply
 *   npx tsx scripts/archive_unused_spend_cap_alerts.ts --execute --workspaceId <sId>
 */
import { baseUniquenessKey } from "@app/lib/metronome/alerts";
import { programmaticCapUniquenessKeys } from "@app/lib/metronome/alerts/programmatic_cap";
import { isUnusedSpendCapAlertUniquenessKey } from "@app/lib/metronome/alerts/spend_limits";
import {
  archiveMetronomeAlert,
  listMetronomeAlerts,
} from "@app/lib/metronome/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Run on a single workspace (sId)",
      type: "string" as const,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    let workspacesScanned = 0;
    let workspacesSkipped = 0;
    let totalArchived = 0;
    let totalFailed = 0;

    async function archiveWorkspace(
      workspace: LightWorkspaceType
    ): Promise<void> {
      const { metronomeCustomerId } = workspace;
      if (!metronomeCustomerId) {
        workspacesSkipped++;
        return;
      }
      workspacesScanned++;

      const programmaticKeys = new Set(
        Object.values(programmaticCapUniquenessKeys(workspace.sId))
      );

      // Collect the ids to archive in a single scan over the customer's alerts.
      const toArchive: { id: string; uniquenessKey: string }[] = [];
      try {
        for await (const entry of listMetronomeAlerts({
          customer_id: metronomeCustomerId,
          alert_statuses: ["ENABLED", "DISABLED"],
        })) {
          const rawKey = entry.alert.uniqueness_key;
          if (!rawKey) {
            continue;
          }
          const baseKey = baseUniquenessKey(rawKey);
          const isUnused =
            isUnusedSpendCapAlertUniquenessKey(baseKey, workspace.sId) ||
            programmaticKeys.has(baseKey);
          if (isUnused) {
            toArchive.push({ id: entry.alert.id, uniquenessKey: baseKey });
          }
        }
      } catch (err) {
        logger.error(
          { workspaceId: workspace.sId, err: normalizeError(err) },
          "[ArchiveSpendCapAlerts] Failed to list alerts; skipping workspace"
        );
        totalFailed++;
        return;
      }

      if (toArchive.length === 0) {
        logger.info(
          { workspaceId: workspace.sId },
          "[ArchiveSpendCapAlerts] No unused spend-cap alerts to archive"
        );
        return;
      }

      let archived = 0;
      let failed = 0;
      for (const { id, uniquenessKey } of toArchive) {
        if (!execute) {
          logger.info(
            { workspaceId: workspace.sId, alertId: id, uniquenessKey },
            "[ArchiveSpendCapAlerts] Would archive unused spend-cap alert (dry run)"
          );
          continue;
        }
        try {
          await archiveMetronomeAlert({ id });
          archived++;
          logger.info(
            { workspaceId: workspace.sId, alertId: id, uniquenessKey },
            "[ArchiveSpendCapAlerts] Archived unused spend-cap alert"
          );
        } catch (err) {
          failed++;
          logger.error(
            {
              workspaceId: workspace.sId,
              alertId: id,
              uniquenessKey,
              err: normalizeError(err),
            },
            "[ArchiveSpendCapAlerts] Failed to archive alert"
          );
        }
      }

      totalArchived += archived;
      totalFailed += failed;
      logger.info(
        {
          workspaceId: workspace.sId,
          matched: toArchive.length,
          archived,
          failed,
          dryRun: !execute,
        },
        "[ArchiveSpendCapAlerts] Workspace summary"
      );
    }

    await runOnAllWorkspaces(archiveWorkspace, { wId: workspaceId });

    logger.info(
      {
        workspacesScanned,
        workspacesSkipped,
        totalArchived,
        totalFailed,
        dryRun: !execute,
      },
      "[ArchiveSpendCapAlerts] Done"
    );
  }
);
