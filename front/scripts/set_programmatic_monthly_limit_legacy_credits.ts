import { syncProgrammaticUsageLimit } from "@app/lib/api/credits/programmatic_usage_limit";
import { Authenticator } from "@app/lib/auth";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { Op, Sequelize } from "sequelize";

/**
 * For every workspace that has consumed legacy (microUSD-based) credits from
 * the `credits` table, set the Metronome "Programmatic monthly limit" to
 * `--monthlyCapCredits`. This persists the cap on `credit_usage_configurations`
 * and creates/updates the corresponding Metronome spend-threshold alerts, via
 * `syncProgrammaticUsageLimit`.
 *
 * Intended to run BEFORE these workspaces' credit-priced (CP/AWU) plan is
 * activated, so the cap is already in place at cutover. `syncProgrammaticUsageLimit`
 * (like `syncCreditBasedPayg` and `syncDefaultPoolCapAlertsForWorkspace`) only
 * gates on the workspace having a Metronome customer id, not on plan type, so
 * it can be called ahead of the plan switch.
 *
 * Workspaces without a Metronome customer id are skipped and logged.
 *
 * Run with: npx tsx scripts/set_programmatic_monthly_limit_legacy_credits.ts \
 *   --monthlyCapCredits <n> [--execute] [--wId <workspaceId>]
 */
makeScript(
  {
    monthlyCapCredits: {
      type: "number",
      required: true,
      description: "Programmatic monthly limit to set, in AWU credits.",
    },
    wId: {
      type: "string",
      required: false,
      description: "Restrict the run to a single workspace (sId).",
    },
  },
  async ({ execute, monthlyCapCredits, wId }, logger) => {
    const rows = (await CreditModel.findAll({
      attributes: [
        [Sequelize.fn("DISTINCT", Sequelize.col("workspaceId")), "workspaceId"],
      ],
      where: { consumedAmountMicroUsd: { [Op.gt]: 0 } },
      raw: true,
    })) as unknown as { workspaceId: number }[];

    const workspaceModelIds = rows.map((r) => r.workspaceId);
    const workspaceResources =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    let workspaces = workspaceResources.map((workspace) =>
      renderLightWorkspaceType({ workspace })
    );

    if (wId) {
      workspaces = workspaces.filter((workspace) => workspace.sId === wId);
    }

    logger.info(
      { count: workspaces.length, monthlyCapCredits },
      "Found workspaces with consumed legacy credits."
    );

    let updated = 0;
    let skipped = 0;

    await concurrentExecutor(
      workspaces,
      async (workspace) => {
        if (!workspace.metronomeCustomerId) {
          logger.info(
            { workspaceId: workspace.sId },
            "Skipping workspace with no Metronome customer id."
          );
          skipped++;
          return;
        }

        logger.info(
          { workspaceId: workspace.sId, monthlyCapCredits },
          execute
            ? "Setting programmatic monthly limit."
            : "Would set programmatic monthly limit."
        );

        if (!execute) {
          updated++;
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const result = await syncProgrammaticUsageLimit({
          auth,
          monthlyCapCredits,
        });

        if (result.isErr()) {
          logger.warn(
            { workspaceId: workspace.sId, err: result.error.message },
            "Failed to set programmatic monthly limit; skipping."
          );
          skipped++;
          return;
        }

        updated++;
      },
      { concurrency: 4 }
    );

    logger.info(
      { updated, skipped },
      execute ? "Run completed." : "Dry run completed."
    );
  }
);
