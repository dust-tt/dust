import { Authenticator } from "@app/lib/auth";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { makeScript } from "@app/scripts/helpers";

/**
 * This script removes temporal workflows for all disabled triggers across all workspaces.
 * This is useful for cleaning up orphaned temporal workflows for triggers that are disabled.
 */

makeScript({}, async ({ execute }, logger) => {
  // List all disabled triggers.
  const triggerResources = await TriggerResource.listAllForScript({
    status: "disabled",
  });

  if (triggerResources.length === 0) {
    logger.info("No disabled triggers found.");
    return;
  }

  logger.info(`Found ${triggerResources.length} disabled trigger(s).`);

  // Group by workspace to minimize the number of workspace fetch.
  const triggersByWorkspace = triggerResources.reduce(
    (acc, trigger) => {
      if (!acc[trigger.workspaceId]) {
        acc[trigger.workspaceId] = [];
      }
      acc[trigger.workspaceId].push(trigger);
      return acc;
    },
    {} as Record<number, TriggerResource[]>
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

    // Process all triggers for this workspace.
    for (const triggerResource of triggersByWorkspace[workspace.id]) {
      if (execute) {
        const result = await triggerResource.removeTemporalWorkflow(auth);
        if (result.isErr()) {
          logger.error(
            {
              triggerId: triggerResource.sId,
              triggerName: triggerResource.name,
              error: result.error.message,
            },
            "Failed to remove temporal workflow"
          );
          errorCount++;
        } else {
          logger.info(
            {
              triggerId: triggerResource.sId,
              triggerName: triggerResource.name,
            },
            "Temporal workflow removed successfully."
          );
          affectedTriggersCount++;
        }
        logger.info(
          "----------------------------------------------------------------------------------------"
        );
      } else {
        logger.info(
          { triggerId: triggerResource.sId, triggerName: triggerResource.name },
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
