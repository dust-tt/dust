import { Authenticator } from "@app/lib/auth";
import { getCachedWorkspaceBalanceThreshold } from "@app/lib/metronome/alerts/balance_threshold";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Backfill `credit_usage_configurations.balanceThresholdAwuCredits` from the
 * existing Metronome balance-threshold alert. The alert threshold is the value
 * the admin entered (in AWU credits), so we copy it directly. The credit-usage
 * configuration row is created lazily, so upsert it.
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

        let balanceThresholdAwuCredits: number | null;
        try {
          const { threshold } = await getCachedWorkspaceBalanceThreshold({
            metronomeCustomerId,
            workspaceId: workspace.sId,
          });
          balanceThresholdAwuCredits = threshold;
        } catch (err) {
          logger.error(
            { workspaceId: workspace.sId, err: normalizeError(err) },
            "Failed to read balance threshold alert; skipping workspace."
          );
          skipped++;
          return;
        }

        if (balanceThresholdAwuCredits === null) {
          // No balance threshold configured for this workspace.
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const config =
          await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
        if (config?.balanceThresholdAwuCredits === balanceThresholdAwuCredits) {
          alreadySet++;
          return;
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            balanceThresholdAwuCredits,
            previous: config?.balanceThresholdAwuCredits ?? null,
          },
          execute
            ? "Backfilling balance threshold."
            : "Would backfill balance threshold."
        );
        if (execute) {
          const writeResult = config
            ? await config.updateConfiguration(auth, {
                balanceThresholdAwuCredits,
              })
            : await CreditUsageConfigurationResource.makeNew(auth, {
                defaultDiscountPercent: 0,
                usageCapCredits: null,
                balanceThresholdAwuCredits,
              });
          if (writeResult.isErr()) {
            logger.error(
              { workspaceId: workspace.sId, err: writeResult.error },
              "Failed to persist balance threshold; skipping workspace."
            );
            skipped++;
            return;
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
