import { QueryTypes, Sequelize } from "sequelize";

import config from "@app/lib/production_checks/config";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
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
      type: "string",
      demandOption: true,
      description: "The sId of the workspace containing the key.",
    },
  },

  async ({ keyId, workspaceId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
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

    const connectorsDb = new Sequelize(
      config.getConnectorsDatabasePrimaryUri(),
      {
        logging: false,
      }
    );

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

    // Using transactions to ensure that we don't end up with a key that is not in sync between the
    // front and connectors databases. Explicitly aborting both transactions if an error occurs.
    await withTransaction(async (frontTransaction) => {
      await connectorsDb.transaction(async (connectorsTransaction) => {
        try {
          const [affectedCount] = await keyToRotate.rotateSecret(
            { dangerouslyRotateSecret: true },
            frontTransaction
          );

          if (affectedCount === 1) {
            logger.info({ keyId }, "Rotated key.");
          } else {
            logger.error({ keyId }, "Failed to rotate key.");
            throw new Error("Failed to rotate key");
          }

          if (connectorsToUpdate.length > 0) {
            await connectorsDb.query(
              `UPDATE connectors SET "workspaceAPIKey" = :workspaceAPIKey WHERE "id" IN (:ids)`,
              {
                replacements: {
                  workspaceAPIKey: keyToRotate.secret,
                  ids: connectorsToUpdate.map((c) => c.id),
                },
                transaction: connectorsTransaction,
                type: QueryTypes.UPDATE,
              }
            );
          }
        } catch (err) {
          logger.error(
            { keyId, error: err },
            "Failed to update connectors -- rollbacking transactions"
          );
          await frontTransaction.rollback();
          await connectorsTransaction.rollback();

          throw err;
        }
      });
    });

    logger.info(
      { keyId, connectorsToUpdate: connectorsToUpdate.map((c) => c.id) },
      "Successfully rotated key and updated related connectors."
    );
  }
);
