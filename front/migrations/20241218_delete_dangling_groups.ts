/*
import { QueryTypes } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

const cleanDanglingGroups = async (
  workspace: LightWorkspaceType,
  execute: boolean
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const allGroups = await GroupResource.listAllWorkspaceGroups(auth, {
    groupKinds: ["global", "regular_auto", "provisioned"],
  });

  for (const group of allGroups) {
    frontSequelize.transaction(async (transaction) => {
      const rows = await frontSequelize.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM group_vaults WHERE "groupId" = :groupId',
        {
          replacements: { groupId: group.id },
          transaction,
          type: QueryTypes.SELECT,
        }
      );
      const c = rows[0].count;

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
*/
