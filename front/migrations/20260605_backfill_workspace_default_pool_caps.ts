import { Authenticator } from "@app/lib/auth";
import { getMetronomeDefaultUserCapAlertForSeatType } from "@app/lib/metronome/alerts/spend_limits";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { NORMALIZED_POOL_LIMIT_SEAT_TYPES } from "@app/types/memberships";

/**
 * Backfill `credit_usage_configurations.defaultPoolCapAwuCredits` from the
 * existing Metronome per-seat-type default cap alerts. The alert threshold is
 * the total cap (seat allowance + pool limit); we subtract the seat type's
 * allowance to recover the pool-only value the admin entered, which is what the
 * column stores (all seat types share the same pool limit, so the first alert
 * found is enough). The credit-usage configuration row is created lazily, so
 * upsert it.
 *
 * Idempotent: workspaces already carrying the expected value are skipped.
 *
 * Pass `--wId <workspaceId>` to run on a single workspace.
 */
makeScript(
  {
    wId: {
      type: "string",
      required: false,
      description: "Run on a single workspace (sId).",
    },
  },
  async ({ execute, wId }, logger) => {
    let updated = 0;
    let alreadySet = 0;
    let skipped = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const { metronomeCustomerId } = workspace;
        if (!metronomeCustomerId) {
          return;
        }

        const contract = await getActiveContract(workspace.sId);
        if (!contract) {
          // Seat allowance is unavailable without an active contract; cannot
          // safely derive the pool-only value from the Metronome threshold.
          return;
        }

        const seatAllowances = await getSeatAllowancesByNormalizedSeatType(
          workspace.sId
        );

        // Find the first seat type with a default cap alert configured (all
        // seat types share the same pool limit).
        let defaultPoolCapAwuCredits: number | null = null;
        for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
          const result = await getMetronomeDefaultUserCapAlertForSeatType({
            metronomeCustomerId,
            workspaceId: workspace.sId,
            seatType,
          });
          if (result.isErr()) {
            logger.error(
              { workspaceId: workspace.sId, seatType, err: result.error },
              "Failed to read default cap alert; skipping workspace."
            );
            skipped++;
            return;
          }
          if (result.value) {
            defaultPoolCapAwuCredits =
              result.value.alert.threshold - (seatAllowances[seatType] ?? 0);
            break;
          }
        }

        if (defaultPoolCapAwuCredits === null) {
          // No default cap configured for this workspace.
          return;
        }
        if (defaultPoolCapAwuCredits < 0) {
          logger.warn(
            { workspaceId: workspace.sId, defaultPoolCapAwuCredits },
            "Alert threshold below seat allowance; skipping."
          );
          skipped++;
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const config =
          await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
        if (config?.defaultPoolCapAwuCredits === defaultPoolCapAwuCredits) {
          alreadySet++;
          return;
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            defaultPoolCapAwuCredits,
            previous: config?.defaultPoolCapAwuCredits ?? null,
          },
          execute
            ? "Backfilling workspace default pool cap."
            : "Would backfill workspace default pool cap."
        );
        if (execute) {
          if (config) {
            await config.updateConfiguration(auth, {
              defaultPoolCapAwuCredits,
            });
          } else {
            await CreditUsageConfigurationResource.makeNew(auth, {
              defaultDiscountPercent: 0,
              usageCapCredits: null,
              defaultPoolCapAwuCredits,
            });
          }
        }
        updated++;
      },
      { wId }
    );

    logger.info(
      { updated, alreadySet, skipped },
      execute ? "Backfill completed." : "Dry run completed."
    );
  }
);
