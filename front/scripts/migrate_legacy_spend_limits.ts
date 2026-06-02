/**
 * One-off migration: convert legacy single default user spend-limit alerts
 * to per-seat-type alerts.
 *
 * For each workspace with a legacy `default-user-cap-{workspaceId}` alert:
 *   1. Read the old threshold (total AWU cap, same for all users).
 *   2. Look up the contract's seat types and their AWU allocations.
 *   3. For each seat type: create a per-seat-type cap + warning alert with
 *      threshold = seatAllowance + poolLimit (old threshold treated as pool limit).
 *   4. Archive the legacy cap + warning alerts.
 *
 * Usage:
 *   npx tsx scripts/migrate_legacy_spend_limits.ts           # dry run
 *   npx tsx scripts/migrate_legacy_spend_limits.ts --execute  # apply
 *   npx tsx scripts/migrate_legacy_spend_limits.ts --execute --workspaceId <sId>
 */
import {
  clearMetronomeAlert,
  findMetronomeAlert,
} from "@app/lib/metronome/alerts";
import {
  upsertMetronomeDefaultUserCapAlertForSeatType,
  upsertMetronomeDefaultUserWarningAlertForSeatType,
} from "@app/lib/metronome/alerts/spend_limits";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import type { NormalizedPoolLimitSeatType } from "@app/types/memberships";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// Legacy uniqueness keys (pre-seat-type).
function legacyCapKey(workspaceId: string): string {
  return `default-user-cap-${workspaceId}`;
}

function legacyWarningKey(workspaceId: string): string {
  return `default-user-warning-${workspaceId}`;
}

makeScript({}, async ({ execute }, logger) => {
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const productSeatTypes = await getProductSeatTypes();

  async function migrateWorkspace(
    workspace: LightWorkspaceType
  ): Promise<void> {
    const { metronomeCustomerId } = workspace;
    if (!metronomeCustomerId) {
      skipped++;
      return;
    }

    // Check if a legacy cap alert exists.
    const legacyResult = await findMetronomeAlert({
      metronomeCustomerId,
      uniquenessKey: legacyCapKey(workspace.sId),
    });
    if (legacyResult.isErr()) {
      logger.warn(
        { workspaceId: workspace.sId, err: legacyResult.error },
        "Failed to read legacy alert, skipping"
      );
      failed++;
      return;
    }
    if (!legacyResult.value) {
      skipped++;
      return;
    }

    const legacyThreshold = legacyResult.value.alert.threshold;
    logger.info(
      { workspaceId: workspace.sId, legacyThreshold },
      "Found legacy default user cap alert"
    );

    // Look up the contract's seat types.
    const contract = await getActiveContract(workspace.sId);
    if (!contract) {
      logger.warn(
        { workspaceId: workspace.sId },
        "No active contract found, skipping"
      );
      skipped++;
      return;
    }

    const seatSubscriptions = getSeatSubscriptionsFromContract(
      contract,
      productSeatTypes
    );

    const normalizedSeatTypes = new Set<NormalizedPoolLimitSeatType>();
    for (const seatType of seatSubscriptions.keys()) {
      const normalized = normalizeToPoolLimitSeatType(seatType);
      if (normalized) {
        normalizedSeatTypes.add(normalized);
      }
    }

    // The legacy threshold was a total cap applied uniformly. Treat it as
    // the pool credit limit. For each seat type, the new threshold =
    // seatAllowance + poolLimit.
    const poolAwuCredits = legacyThreshold;

    for (const seatType of normalizedSeatTypes) {
      const seatAllowance = getAwuAllocationForSeatType(
        contract,
        seatType,
        productSeatTypes
      );
      const totalThreshold = seatAllowance + poolAwuCredits;

      logger.info(
        {
          workspaceId: workspace.sId,
          seatType,
          seatAllowance,
          poolAwuCredits,
          totalThreshold,
        },
        "Creating per-seat-type alert"
      );

      if (execute) {
        const capResult = await upsertMetronomeDefaultUserCapAlertForSeatType({
          metronomeCustomerId,
          workspaceId: workspace.sId,
          seatType,
          awuCredits: totalThreshold,
        });
        if (capResult.isErr()) {
          logger.error(
            { workspaceId: workspace.sId, seatType, err: capResult.error },
            "Failed to create per-seat-type cap alert"
          );
          failed++;
          return;
        }

        const warningResult =
          await upsertMetronomeDefaultUserWarningAlertForSeatType({
            metronomeCustomerId,
            workspaceId: workspace.sId,
            seatType,
            capAwuCredits: totalThreshold,
          });
        if (warningResult.isErr()) {
          logger.warn(
            {
              workspaceId: workspace.sId,
              seatType,
              err: warningResult.error,
            },
            "Failed to create per-seat-type warning alert, continuing"
          );
        }
      }
    }

    // Archive the legacy alerts.
    if (execute) {
      const [capArchive, warningArchive] = await Promise.all([
        clearMetronomeAlert({
          metronomeCustomerId,
          uniquenessKey: legacyCapKey(workspace.sId),
        }),
        clearMetronomeAlert({
          metronomeCustomerId,
          uniquenessKey: legacyWarningKey(workspace.sId),
        }),
      ]);
      if (capArchive.isOk() && capArchive.value) {
        logger.info(
          { workspaceId: workspace.sId, alertId: capArchive.value.alertId },
          "Archived legacy cap alert"
        );
      }
      if (warningArchive.isOk() && warningArchive.value) {
        logger.info(
          {
            workspaceId: workspace.sId,
            alertId: warningArchive.value.alertId,
          },
          "Archived legacy warning alert"
        );
      }
    }

    migrated++;
    logger.info(
      {
        workspaceId: workspace.sId,
        seatTypes: [...normalizedSeatTypes],
        poolAwuCredits,
      },
      "Migrated legacy alert to per-seat-type alerts"
    );
  }

  await runOnAllWorkspaces(migrateWorkspace);

  logger.info({ migrated, skipped, failed }, "Migration complete");
});
