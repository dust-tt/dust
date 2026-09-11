/**
 * One-off cleanup: archive the Metronome per-user free-credit-balance alerts
 * that are no longer used for anything.
 *
 * Free→pro and pro→max seat auto-upgrades are now driven reactively at
 * message-send time (`maybeAutoUpgradeSeat`), and the webhook branches that
 * consumed the per-user free-credit exhaustion / low-balance alerts were
 * removed. Nothing reads these alerts anymore, so this archives them.
 *
 * It only touches the two per-user credit-balance alert types, identified by
 * their base uniqueness-key prefixes for the workspace. It does NOT touch any
 * other alert type (spend caps, workspace balance thresholds, etc.).
 *
 * Usage:
 *   npx tsx scripts/archive_per_user_credit_balance_alerts.ts            # dry run
 *   npx tsx scripts/archive_per_user_credit_balance_alerts.ts --execute  # apply
 *   npx tsx scripts/archive_per_user_credit_balance_alerts.ts --execute --workspaceId <sId>
 */
import { baseUniquenessKey } from "@app/lib/metronome/alerts";
import {
  archiveMetronomeAlert,
  getMetronomeClient,
  listMetronomeAlerts,
} from "@app/lib/metronome/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// The two per-user credit-balance alert uniqueness-key prefixes, defined inline
// here because their former home (`@app/lib/metronome/alerts/per_user_credit_balance`)
// has been deleted along with the rest of the alert machinery. Kept in sync with
// what that module used to produce:
//   `per-user-credit-exhausted-<workspaceId>-<userId>`
//   `per-user-credit-low-<workspaceId>-<userId>`
function perUserCreditAlertUniquenessKeyPrefixes(
  workspaceId: string
): string[] {
  return [
    `per-user-credit-exhausted-${workspaceId}-`,
    `per-user-credit-low-${workspaceId}-`,
  ];
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
    // error for every workspace and exit "successfully" (no-catching-own-errors).
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

      const prefixes = perUserCreditAlertUniquenessKeyPrefixes(workspace.sId);

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
          const isPerUserCreditAlert = prefixes.some((prefix) =>
            baseKey.startsWith(prefix)
          );
          if (isPerUserCreditAlert) {
            toArchive.push({ id: entry.alert.id, uniquenessKey: baseKey });
          }
        }
      } catch (err) {
        logger.error(
          { workspaceId: workspace.sId, err: normalizeError(err) },
          "[ArchivePerUserCreditAlerts] Failed to list alerts; skipping workspace"
        );
        totalFailed++;
        return;
      }

      if (toArchive.length === 0) {
        logger.info(
          { workspaceId: workspace.sId },
          "[ArchivePerUserCreditAlerts] No per-user credit-balance alerts to archive"
        );
        return;
      }

      let archived = 0;
      let failed = 0;
      for (const { id, uniquenessKey } of toArchive) {
        if (!execute) {
          logger.info(
            { workspaceId: workspace.sId, alertId: id, uniquenessKey },
            "[ArchivePerUserCreditAlerts] Would archive per-user credit-balance alert (dry run)"
          );
          continue;
        }
        try {
          await archiveMetronomeAlert({ id });
          archived++;
          logger.info(
            { workspaceId: workspace.sId, alertId: id, uniquenessKey },
            "[ArchivePerUserCreditAlerts] Archived per-user credit-balance alert"
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
            "[ArchivePerUserCreditAlerts] Failed to archive alert"
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
        "[ArchivePerUserCreditAlerts] Workspace summary"
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
      "[ArchivePerUserCreditAlerts] Done"
    );
  }
);
