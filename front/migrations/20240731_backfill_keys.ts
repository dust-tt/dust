import type { LightWorkspaceType } from "@dust-tt/types";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function backfillApiKeys(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const globalGroup = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  const allKeys = await KeyResource.listNonSystemKeysByWorkspace(workspace);

  for (const key of allKeys) {
    if (!key.groupId) {
      logger.info(`Backfilling key ${key.id} to global group`);
      if (execute) {
        await KeyResource.model.update(
          { groupId: globalGroup.id },
          {
            where: {
              id: key.id,
            },
          }
        );
      }
    }
  }

  const systemGroup = await GroupResource.fetchWorkspaceSystemGroup(auth);
  const systemKey = await KeyResource.fetchSystemKeyForWorkspace(workspace);
  if (systemKey && !systemKey.groupId) {
    logger.info(`Backfilling system key ${systemKey.id} to system group`);
    if (execute) {
      await KeyResource.model.update(
        { groupId: systemGroup.id },
        {
          where: {
            id: systemKey.id,
          },
        }
      );
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillApiKeys(workspace, logger, execute);
  });
});
