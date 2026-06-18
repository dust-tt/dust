import { Authenticator } from "@app/lib/auth";
import { getMetronomeProgrammaticCapAlertStates } from "@app/lib/metronome/alerts/programmatic_cap";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

/**
 * Backfill `credit_usage_configurations.programmaticMonthlyCapAwuCredits` from
 * the existing Metronome programmatic cap alert. Unlike the per-user pool cap,
 * the cap alert threshold is the cap value itself (no seat-allowance math), so
 * we copy it directly. The credit-usage configuration row is created lazily, so
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

        const statesResult = await getMetronomeProgrammaticCapAlertStates({
          metronomeCustomerId,
          workspaceId: workspace.sId,
        });
        if (statesResult.isErr()) {
          logger.error(
            { workspaceId: workspace.sId, err: statesResult.error },
            "Failed to read programmatic cap alerts; skipping workspace."
          );
          skipped++;
          return;
        }

        const programmaticMonthlyCapAwuCredits =
          statesResult.value.cap?.threshold ?? null;
        if (programmaticMonthlyCapAwuCredits === null) {
          // No programmatic cap configured for this workspace.
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const config =
          await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
        if (
          config?.programmaticMonthlyCapAwuCredits ===
          programmaticMonthlyCapAwuCredits
        ) {
          alreadySet++;
          return;
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            programmaticMonthlyCapAwuCredits,
            previous: config?.programmaticMonthlyCapAwuCredits ?? null,
          },
          execute
            ? "Backfilling programmatic monthly cap."
            : "Would backfill programmatic monthly cap."
        );
        if (execute) {
          if (config) {
            await config.updateConfiguration(auth, {
              programmaticMonthlyCapAwuCredits,
            });
          } else {
            await CreditUsageConfigurationResource.makeNew(auth, {
              defaultDiscountPercent: 0,
              usageCapCredits: null,
              programmaticMonthlyCapAwuCredits,
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
