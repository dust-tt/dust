import { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

/**
 * This script pauses/unpauses all triggers across all workspaces.
 * This allows to soft refresh all triggers by doing the pre-delete / post-create logic.
 */

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const triggers = await TriggerResource.listByWorkspace(auth);
    const activeTriggers = triggers.filter((t) => t.enabled);

    for (const trigger of activeTriggers) {
      const user = await UserResource.fetchByModelId(trigger.editor);
      if (!user) {
        logger.error(
          { triggerId: trigger.sId(), triggerName: trigger.name },
          "Trigger editor user not found"
        );
        continue;
      }

      const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      if (execute) {
        await trigger.disable(editorAuth);
        logger.info(
          { triggerId: trigger.sId(), triggerName: trigger.name },
          "Disabled trigger"
        );
        await trigger.enable(editorAuth);
        logger.info(
          { triggerId: trigger.sId(), triggerName: trigger.name },
          "Re-enabled trigger"
        );
      } else {
        logger.info(
          { triggerId: trigger.sId(), triggerName: trigger.name },
          "Would disable and re-enable trigger (dry run)"
        );
      }
    }
  });
});
