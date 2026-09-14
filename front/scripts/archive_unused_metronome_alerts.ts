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
 * the PAYG usage-cap alert (`payg-cap-*`) or the account-wide default alerts,
 * which are all still in use.
 *
 * The sweep iterates Metronome customers directly (not the `workspaces` table),
 * so it also reaches alerts left behind by DELETED workspaces: the workspace
 * scrub / deletion path never archives Metronome alerts, and nothing recreates
 * these retired alert types, so a deleted workspace's alerts would otherwise
 * survive forever. Matching is workspace-id-agnostic (by key prefix) since every
 * one of these alert types is globally retired.
 *
 * Usage:
 *   npx tsx scripts/archive_unused_metronome_alerts.ts               # dry run, all customers
 *   npx tsx scripts/archive_unused_metronome_alerts.ts --execute     # apply, all customers
 *   npx tsx scripts/archive_unused_metronome_alerts.ts --execute --workspaceId <sId>
 *   npx tsx scripts/archive_unused_metronome_alerts.ts --execute --customerId <metronomeCustomerId>
 */
import { baseUniquenessKey } from "@app/lib/metronome/alerts";
import { isProgrammaticCapAlertUniquenessKeyAnyWorkspace } from "@app/lib/metronome/alerts/programmatic_cap";
import { isUnusedSpendCapAlertUniquenessKeyAnyWorkspace } from "@app/lib/metronome/alerts/spend_limits";
import {
  archiveMetronomeAlert,
  getMetronomeClient,
  listMetronomeAlerts,
  listMetronomeCustomers,
} from "@app/lib/metronome/client";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

// The two per-user free-credit-balance alert uniqueness-key prefixes. Defined
// inline because their former home
// (`@app/lib/metronome/alerts/per_user_credit_balance`) was deleted with the
// rest of that alert machinery. Kept in sync with what it used to produce:
//   `per-user-credit-exhausted-<workspaceId>-<userId>`
//   `per-user-credit-low-<workspaceId>-<userId>`
function isPerUserCreditBalanceAlertKey(baseKey: string): boolean {
  return (
    baseKey.startsWith("per-user-credit-exhausted-") ||
    baseKey.startsWith("per-user-credit-low-")
  );
}

// A base uniqueness key (generation suffix already stripped) belongs to one of
// the retired alert families, for any workspace.
function isUnusedMetronomeAlertKey(baseKey: string): boolean {
  return (
    isUnusedSpendCapAlertUniquenessKeyAnyWorkspace(baseKey) ||
    isProgrammaticCapAlertUniquenessKeyAnyWorkspace(baseKey) ||
    isPerUserCreditBalanceAlertKey(baseKey)
  );
}

type CustomerTarget = {
  metronomeCustomerId: string;
  // Best-effort workspace sId (the customer's first ingest alias), for logging.
  workspaceId: string | null;
};

// A single scan over one customer's alerts, archiving the retired ones.
async function archiveCustomerAlerts(
  { metronomeCustomerId, workspaceId }: CustomerTarget,
  execute: boolean,
  logger: Logger
): Promise<{ archived: number; failed: number }> {
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
      if (isUnusedMetronomeAlertKey(baseKey)) {
        toArchive.push({ id: entry.alert.id, uniquenessKey: baseKey });
      }
    }
  } catch (err) {
    logger.error(
      { workspaceId, metronomeCustomerId, err: normalizeError(err) },
      "[ArchiveMetronomeAlerts] Failed to list alerts; skipping customer"
    );
    return { archived: 0, failed: 1 };
  }

  if (toArchive.length === 0) {
    return { archived: 0, failed: 0 };
  }

  let archived = 0;
  let failed = 0;
  for (const { id, uniquenessKey } of toArchive) {
    if (!execute) {
      logger.info(
        { workspaceId, metronomeCustomerId, alertId: id, uniquenessKey },
        "[ArchiveMetronomeAlerts] Would archive unused Metronome alert (dry run)"
      );
      continue;
    }
    try {
      await archiveMetronomeAlert({ id });
      archived++;
      logger.info(
        { workspaceId, metronomeCustomerId, alertId: id, uniquenessKey },
        "[ArchiveMetronomeAlerts] Archived unused Metronome alert"
      );
    } catch (err) {
      failed++;
      logger.error(
        {
          workspaceId,
          metronomeCustomerId,
          alertId: id,
          uniquenessKey,
          err: normalizeError(err),
        },
        "[ArchiveMetronomeAlerts] Failed to archive alert"
      );
    }
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      matched: toArchive.length,
      archived,
      failed,
      dryRun: !execute,
    },
    "[ArchiveMetronomeAlerts] Customer summary"
  );
  return { archived, failed };
}

// Stream the customers to scan. `--customerId` yields one target directly (works
// even for a deleted workspace); `--workspaceId` resolves through the DB;
// otherwise every Metronome customer is streamed (the only path that reaches
// deleted workspaces' orphaned alerts). Streaming — rather than buffering all
// ~5000 customers up front — lets the sweep make incremental progress and start
// archiving as the first page arrives. Yields nothing on a bad `--workspaceId`
// (after logging).
async function* iterTargets(
  { workspaceId, customerId }: { workspaceId?: string; customerId?: string },
  logger: Logger
): AsyncGenerator<CustomerTarget> {
  if (customerId) {
    yield { metronomeCustomerId: customerId, workspaceId: null };
    return;
  }

  if (workspaceId) {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error(
        { workspaceId },
        "[ArchiveMetronomeAlerts] Workspace not found"
      );
      return;
    }
    if (!workspace.metronomeCustomerId) {
      logger.info(
        { workspaceId },
        "[ArchiveMetronomeAlerts] Workspace has no Metronome customer; nothing to do"
      );
      return;
    }
    yield {
      metronomeCustomerId: workspace.metronomeCustomerId,
      workspaceId: workspace.sId,
    };
    return;
  }

  for await (const customer of listMetronomeCustomers()) {
    yield {
      metronomeCustomerId: customer.id,
      workspaceId: customer.ingest_aliases[0] ?? null,
    };
  }
}

// Pull an async iterable in fixed-size batches, so the caller can process (and
// log progress for) each batch as customers page in, bounding memory instead of
// materializing the whole customer list.
async function* batchAsync<T>(
  source: AsyncIterable<T>,
  size: number
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) {
    yield batch;
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Run on a single workspace (sId), resolved via the DB",
      type: "string" as const,
    },
    customerId: {
      alias: "c",
      describe:
        "Run on a single Metronome customer id (works for deleted workspaces)",
      type: "string" as const,
    },
  },
  async ({ execute, workspaceId, customerId }, logger) => {
    // Resolve the Metronome client up front so a misconfigured run (no
    // METRONOME_API_KEY) throws here and propagates to the runtime handler,
    // rather than having the per-customer catch below swallow the same config
    // error for every customer and exit "successfully".
    getMetronomeClient();

    logger.info(
      { dryRun: !execute },
      "[ArchiveMetronomeAlerts] Scanning Metronome customers for unused alerts"
    );

    // Process customers in batches as they page in: each batch runs concurrently,
    // then we log cumulative progress so a full ~5000-customer sweep is visibly
    // advancing rather than appearing stuck.
    const CONCURRENCY = 4;
    const BATCH_SIZE = 50;
    let customersScanned = 0;
    let totalArchived = 0;
    let totalFailed = 0;

    for await (const batch of batchAsync(
      iterTargets({ workspaceId, customerId }, logger),
      BATCH_SIZE
    )) {
      await concurrentExecutor(
        batch,
        async (target) => {
          const { archived, failed } = await archiveCustomerAlerts(
            target,
            execute,
            logger
          );
          totalArchived += archived;
          totalFailed += failed;
        },
        { concurrency: CONCURRENCY }
      );
      customersScanned += batch.length;
      logger.info(
        { customersScanned, totalArchived, totalFailed, dryRun: !execute },
        "[ArchiveMetronomeAlerts] Progress"
      );
    }

    logger.info(
      { customersScanned, totalArchived, totalFailed, dryRun: !execute },
      "[ArchiveMetronomeAlerts] Done"
    );
  }
);
