import { QueryTypes, Sequelize } from "sequelize";

import config from "@app/lib/production_checks/config";
import { KeyResource } from "@app/lib/resources/key_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

interface ConnectorBlob {
  id: number;
  workspaceId: string;
  workspaceAPIKey: string;
}

makeScript(
  {
    keyId: {
      type: "string",
      demandOption: true,
      description: "The ID of the key to rotate.",
    },
    workspaceId: {
      type: "number",
      demandOption: true,
      description: "The ID of the workspace containing the key.",
    },
  },

  async ({ keyId, workspaceId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
    let connectorsPrimaryDbInstance: Sequelize | null = null;

    if (!workspace) {
      logger.error("Workspace not found.");
      return;
    }

    const lightWorkspace = renderLightWorkspaceType({ workspace });

    const keyToRotate = await KeyResource.fetchByWorkspaceAndId(
      lightWorkspace,
      keyId
    );

    if (!keyToRotate) {
      logger.error("Key not found.");
      return;
    }

    logger.info({ keyToRotate: keyToRotate.id }, "Found key to rotate.");

    function getConnectorsPrimaryDbConnection() {
      if (!connectorsPrimaryDbInstance) {
        connectorsPrimaryDbInstance = new Sequelize(
          config.getConnectorsDatabasePrimaryUri(),
          {
            logging: false,
          }
        );
      }
      return connectorsPrimaryDbInstance;
    }

    const connectorsDb = getConnectorsPrimaryDbConnection();
    const frontDb = frontSequelize;

    const connectorsToUpdate: ConnectorBlob[] = await connectorsDb.query(
      `SELECT * FROM connectors WHERE "workspaceId" = :workspaceId AND "workspaceAPIKey" = :workspaceAPIKey`,
      {
        replacements: {
          workspaceId: workspace.sId,
          workspaceAPIKey: keyToRotate.secret,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (connectorsToUpdate.length === 0) {
      logger.info({ keyId }, "No connectors found to update with this key.");
    } else {
      logger.info(
        { keyId, connectorsToUpdate: connectorsToUpdate.map((c) => c.id) },
        "Found connectors to update."
      );
    }

    if (!execute) {
      logger.info(
        { keyId, connectorsToUpdate: connectorsToUpdate.map((c) => c.id) },
        "Dry run. Would rotate key and update related connectors."
      );
      return;
    }

    await frontDb.transaction(async (frontTransaction) => {
      await connectorsDb.transaction(async (connectorsTransaction) => {
        const result = await keyToRotate.rotateSecret(frontTransaction);

        if (result[0] === 1) {
          logger.info({ keyId }, "rotated key");
        } else {
          logger.error({ keyId }, "failed to rotate key");
          throw new Error("Failed to rotate key");
        }

        if (connectorsToUpdate.length > 0) {
          for (const connector of connectorsToUpdate) {
            await connectorsDb.query(
              `UPDATE connectors SET "workspaceAPIKey" = :workspaceAPIKey WHERE "id" = :id`,
              {
                replacements: {
                  workspaceAPIKey: keyToRotate.secret,
                  id: connector.id,
                },
                transaction: connectorsTransaction,
                type: QueryTypes.UPDATE,
              }
            );
          }
        }
      });

      logger.info(
        { keyId, connectorsToUpdate: connectorsToUpdate.map((c) => c.id) },
        "Successfully rotated key and updated related connectors."
      );
    });
  }
);
