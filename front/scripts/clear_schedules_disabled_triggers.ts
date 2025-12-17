import { Authenticator } from "@app/lib/auth";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { makeScript } from "@app/scripts/helpers";

/**
 * This script removes temporal workflows for all disabled triggers across all workspaces.
 * This is useful for cleaning up orphaned temporal workflows for triggers that are disabled.
 */

makeScript({}, async ({ execute }, logger) => {
  // List all disabled triggers.
  const triggers = await TriggerModel.findAll({
    where: { enabled: false },
  });

  if (triggers.length === 0) {
    logger.info("No disabled triggers found.");
    return;
  }

  logger.info(`Found ${triggers.length} disabled trigger(s).`);

  // Group by workspace to minimize the number of workspace fetch.
  const triggersByWorkspace = triggers.reduce(
    (acc, trigger) => {
      if (!acc[trigger.workspaceId]) {
        acc[trigger.workspaceId] = [];
      }
      acc[trigger.workspaceId].push(trigger);
      return acc;
    },
    {} as Record<number, TriggerModel[]>
  );

  let affectedTriggersCount = 0;
  let errorCount = 0;

  // For each workspace, process all triggers sequentially.
  for (const w of Object.keys(triggersByWorkspace)) {
    const workspace = await WorkspaceModel.findByPk(w);
    if (!workspace) {
      logger.error({ workspaceId: w }, "Trigger workspace not found");
      continue;
    }

    // Get internal admin auth for the workspace to be able to remove temporal schedules.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Fetch all triggers resources from sIds.
    for (const trigger of triggersByWorkspace[workspace.id]) {
      const t = new TriggerResource(TriggerModel, trigger.get());

      if (execute) {
        const result = await t.removeTemporalWorkflow(auth);
        if (result.isErr()) {
          logger.error(
            {
              triggerId: t.sId,
              triggerName: t.name,
              error: result.error.message,
            },
            "Failed to remove temporal workflow"
          );
          errorCount++;
        } else {
          logger.info(
            { triggerId: t.sId, triggerName: t.name },
            "Temporal workflow removed successfully."
          );
          affectedTriggersCount++;
        }
        logger.info(
          "----------------------------------------------------------------------------------------"
        );
      } else {
        logger.info(
          { triggerId: t.sId, triggerName: t.name },
          "Would remove temporal workflow (dry run)"
        );
        logger.info(
          "----------------------------------------------------------------------------------------"
        );
      }
    }
  }

  logger.info(
    `Script completed. ${affectedTriggersCount} temporal workflows were removed. ${errorCount} errors occurred.`
  );
});
