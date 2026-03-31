import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { LightWorkspaceType } from "@app/types/user";

async function backfillApiKeys(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  logger.info("Handle workspace " + workspace.id);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  if (execute) {
    const systemGroup = await GroupResource.fetchWorkspaceSystemGroup(auth);
    if (systemGroup.isOk()) {
      await KeyResource.model.update(
        // @ts-ignore -- Legacy migration: groupId column was removed.
        { groupId: systemGroup.value.id },
        {
          where: {
            workspaceId: workspace.id,
            isSystem: true,
          },
        }
      );
    }
  }
  logger.info("Done with workspace " + workspace.id);
}

makeScript({}, async ({ execute }, logger) => {
  const keys = await KeyModel.findAll({
    where: {
      isSystem: true,
      status: "active",
      // @ts-ignore -- Legacy migration: groupId column was removed.
      groupId: null,
    },
  });

  logger.info({ keyCount: keys.length }, "Found keys to backfill");
  for (const key of keys) {
    const workspace = await WorkspaceResource.fetchByModelId(key.workspaceId);
    if (!workspace) {
      throw new Error(
        `Workspace not found for key: ${key.id}, workspaceId: ${key.workspaceId}`
      );
    }

    await backfillApiKeys(
      await renderLightWorkspaceType({ workspace: workspace }),
      logger,
      execute
    );
  }
});
