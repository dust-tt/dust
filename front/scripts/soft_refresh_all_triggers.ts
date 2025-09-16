import { Authenticator } from "@app/lib/auth";
import { TriggerModel } from "@app/lib/models/assistant/triggers/triggers";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";

/**
 * This script pauses/unpauses all triggers across all workspaces.
 * This allows to soft refresh all triggers by doing the pre-delete / post-create logic.
 */

makeScript({}, async ({ execute }, logger) => {
  // List all triggers that exists.
  const triggers = await TriggerModel.findAll();
  const activeTriggers = triggers.filter((t) => t.enabled);

  // Group by workspace to minimize the number of workspace fetch.
  const triggersByWorkspace = activeTriggers.reduce(
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

  // For each workspace, process all triggers sequentially.
  for (const w of Object.keys(triggersByWorkspace)) {
    const workspace = await WorkspaceModel.findByPk(w);
    if (!workspace) {
      logger.error({ workspaceId: w }, "Trigger workspace not found");
      continue;
    }

    // Fetch all triggers resources from sIds.
    for (const trigger of triggersByWorkspace[workspace.id]) {
      const t = new TriggerResource(TriggerModel, trigger.get());
      const user = await UserResource.fetchByModelId(t.editor);
      if (!user) {
        logger.error(
          { triggerId: t.sId(), triggerName: t.name },
          "Trigger editor user not found"
        );
        continue;
      }

      const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      if (execute) {
        await t.disable(editorAuth);
        await t.enable(editorAuth);
        logger.info(
          { triggerId: t.sId(), triggerName: t.name },
          "Trigger reset successful."
        );
        affectedTriggersCount++;
        logger.info(
          "----------------------------------------------------------------------------------------"
        );
      } else {
        logger.info(
          { triggerId: t.sId(), triggerName: t.name },
          "Would disable and re-enable trigger (dry run)"
        );
        logger.info(
          "----------------------------------------------------------------------------------------"
        );
      }
    }
  }

  logger.info(
    `Script completed. ${affectedTriggersCount} triggers were reset.`
  );
});
