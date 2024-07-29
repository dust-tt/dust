import _ from "lodash";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

async function backfillWorkspacesGroup(execute: boolean) {
  const workspaces = await Workspace.findAll();

  const chunks = _.chunk(workspaces, 16);
  for (const [i, c] of chunks.entries()) {
    console.log(
      `[execute=${execute}] Processing chunk of ${c.length} workspaces... (${
        i + 1
      }/${chunks.length})`
    );
    if (execute) {
      await Promise.all(
        c.map((w) =>
          (async () => {
            try {
              const auth = await Authenticator.internalAdminForWorkspace(w.sId);
              const systemGroup =
                await GroupResource.fetchWorkspaceSystemGroup(auth);
              const globalGroup =
                await GroupResource.fetchWorkspaceGlobalGroup(auth);
              if (systemGroup == null || globalGroup == null) {
                throw new Error("System or global group not found.");
              }
              const { systemVault, globalVault } =
                await VaultResource.makeDefaultsForWorkspace(
                  renderLightWorkspaceType({ workspace: w }),
                  {
                    systemGroup,
                    globalGroup,
                  }
                );
              // Move connected (non webcrawler) to system vault
              await DataSource.update(
                { vaultId: systemVault.id },
                {
                  where: {
                    workspaceId: w.id,
                    connectorId: {
                      [Op.ne]: null,
                    },
                    connectorProvider: {
                      [Op.ne]: "webcrawler",
                    },
                  },
                }
              );
              // Move non-connected to global vault
              await DataSource.update(
                { vaultId: globalVault.id },
                {
                  where: {
                    workspaceId: w.id,
                    connectorId: {
                      [Op.eq]: null,
                    },
                  },
                }
              );
              // Move webcrawler to global vault
              await DataSource.update(
                { vaultId: globalVault.id },
                {
                  where: {
                    workspaceId: w.id,
                    connectorProvider: "webcrawler",
                  },
                }
              );
            } catch (error) {
              console.error(error);
            }
          })()
        )
      );
    }
  }

  console.log(`Done.`);
}

makeScript({}, async ({ execute }) => {
  await backfillWorkspacesGroup(execute);
});
