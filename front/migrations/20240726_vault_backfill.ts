import _ from "lodash";
import { Op } from "sequelize";

import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import { VaultResource } from "@app/lib/resources/vault_resource";
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
              const groups = await GroupModel.findAll({
                where: {
                  workspaceId: w.id,
                },
              });
              const systemGroupId = groups.find((g) => g.type === "system")?.id;
              const globalGroupId = groups.find((g) => g.type === "global")?.id;
              if (systemGroupId == null || globalGroupId == null) {
                throw new Error("System or global group not found.");
              }
              const { systemVault, globalVault } =
                await VaultResource.makeDefaultForWorkspace(
                  w.id,
                  systemGroupId,
                  globalGroupId
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
