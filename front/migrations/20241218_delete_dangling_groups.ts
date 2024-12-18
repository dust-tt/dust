import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import logger from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";
import { LightWorkspaceType } from "@dust-tt/types";

const cleanDanglingGroups = async (
  workspace: LightWorkspaceType,
  execute: boolean
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const allGroups = await GroupResource.listAllWorkspaceGroups(auth);

  for (const group of allGroups) {
    frontSequelize.transaction(async (transaction) => {
      const c = await GroupSpaceModel.count({
        where: { groupId: group.id },
        transaction,
      });

      if (c === 0) {
        logger.info({ groupId: group.id }, "Deleting group");
        if (execute) {
          await group.delete(auth, { transaction });
        }
      }
    });
  }
};

makeScript({}, async ({ execute }) => {
  return runOnAllWorkspaces(async (workspace) => {
    await cleanDanglingGroups(workspace, execute);
  });
});
