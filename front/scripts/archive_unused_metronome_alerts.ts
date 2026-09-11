/**
 * One-off cleanup: archive the Metronome alerts that Dust no longer uses —
 * the retired spend-cap alerts and the free-seat per-user credit-balance alerts.
 *
 * Per-user, per-API-key and programmatic spend caps are now enforced from Redis
 * fixed-window rate-limiter counters compared against DB-persisted cap values
 * (membership pool-cap overrides, `credit_usage_configurations`, group caps) and
 * Metronome seat pricing. The `spend_threshold_reached` alerts we used to create
 * to drive webhook enforcement — per-user cap/warning, per-seat-type default
 * cap/warning, per-group cap/warning, and the four programmatic cap alerts — no
 * longer feed anything, so this archives them.
 *
 * It also archives the free-seat per-user credit-balance alerts
 * (`per-user-credit-exhausted-*` / `per-user-credit-low-*`), retired now that
 * free→pro auto-upgrade is driven reactively at message-send time. It does NOT
 * touch the workspace balance-threshold alert (`workspace-balance-threshold-*`),
 * which is still in use.
 *
 * Usage:
 *   npx tsx scripts/archive_unused_metronome_alerts.ts            # dry run
 *   npx tsx scripts/archive_unused_metronome_alerts.ts --execute  # apply
 *   npx tsx scripts/archive_unused_metronome_alerts.ts --execute --workspaceId <sId>
 */
import { baseUniquenessKey } from "@app/lib/metronome/alerts";
import { programmaticCapUniquenessKeys } from "@app/lib/metronome/alerts/programmatic_cap";
import { isUnusedSpendCapAlertUniquenessKey } from "@app/lib/metronome/alerts/spend_limits";
import {
  archiveMetronomeAlert,
  getMetronomeClient,
  listMetronomeAlerts,
} from "@app/lib/metronome/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// The two per-user free-credit-balance alert uniqueness-key prefixes. Defined
// inline because their former home
// (`@app/lib/metronome/alerts/per_user_credit_balance`) was deleted with the
// rest of that alert machinery. Kept in sync with what it used to produce:
//   `per-user-credit-exhausted-<workspaceId>-<userId>`
//   `per-user-credit-low-<workspaceId>-<userId>`
function isPerUserCreditBalanceAlertKey(
  baseKey: string,
  workspaceId: string
): boolean {
  return (
    baseKey.startsWith(`per-user-credit-exhausted-${workspaceId}-`) ||
    baseKey.startsWith(`per-user-credit-low-${workspaceId}-`)
  );
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Run on a single workspace (sId)",
      type: "string" as const,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    // Resolve the Metronome client up front so a misconfigured run (no
    // METRONOME_API_KEY) throws here and propagates to the runtime handler,
    // rather than having the per-workspace catch below swallow the same config
    // error for every workspace and exit "successfully".
    getMetronomeClient();

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
            programmaticKeys.has(baseKey) ||
            isPerUserCreditBalanceAlertKey(baseKey, workspace.sId);
          if (isUnused) {
            toArchive.push({ id: entry.alert.id, uniquenessKey: baseKey });
          }
        }
      } catch (err) {
        logger.error(
          { workspaceId: workspace.sId, err: normalizeError(err) },
          "[ArchiveMetronomeAlerts] Failed to list alerts; skipping workspace"
        );
        totalFailed++;
        return;
      }

      if (toArchive.length === 0) {
        logger.info(
          { workspaceId: workspace.sId },
          "[ArchiveMetronomeAlerts] No unused Metronome alerts to archive"
        );
        return;
      }

      let archived = 0;
      let failed = 0;
      for (const { id, uniquenessKey } of toArchive) {
        if (!execute) {
          logger.info(
            { workspaceId: workspace.sId, alertId: id, uniquenessKey },
            "[ArchiveMetronomeAlerts] Would archive unused Metronome alert (dry run)"
          );
          continue;
        }
        try {
          await archiveMetronomeAlert({ id });
          archived++;
          logger.info(
            { workspaceId: workspace.sId, alertId: id, uniquenessKey },
            "[ArchiveMetronomeAlerts] Archived unused Metronome alert"
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
            "[ArchiveMetronomeAlerts] Failed to archive alert"
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
        "[ArchiveMetronomeAlerts] Workspace summary"
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
      "[ArchiveMetronomeAlerts] Done"
    );
  }
);
