import { google } from "googleapis";
import { Transaction } from "sequelize";

import {
  Connector,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
  ModelId,
  sequelize_conn,
} from "@connectors/lib/models.js";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import {
  ConnectorPermission,
  ConnectorResource,
  ConnectorResourceType,
} from "@connectors/types/resources";

import { registerWebhook } from "./lib";
import { getDriveClient, getGoogleCredentials } from "./temporal/activities";
export type NangoConnectionId = string;

const {
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = process.env;

export async function createGoogleDriveConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  try {
    const connector = await sequelize_conn.transaction(
      async (t): Promise<Connector> => {
        if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
          throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
        }
        const driveClient = await getDriveClient(nangoConnectionId);
        const sanityCheckRes = await driveClient.about.get({ fields: "*" });
        if (sanityCheckRes.status !== 200) {
          throw new Error(
            `Could not get google drive info. Error message: ${
              sanityCheckRes.statusText || "unknown"
            }`
          );
        }

        const connector = await Connector.create(
          {
            type: "google_drive",
            connectionId: nangoConnectionId,
            workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
            workspaceId: dataSourceConfig.workspaceId,
            dataSourceName: dataSourceConfig.dataSourceName,
            defaultNewResourcePermission: "read_write",
          },
          { transaction: t }
        );

        const webhookInfo = await registerWebhook(connector.connectionId);
        if (webhookInfo.isErr()) {
          throw webhookInfo.error;
        } else {
          await GoogleDriveWebhook.create(
            {
              webhookId: webhookInfo.value.id,
              expiresAt: new Date(webhookInfo.value.expirationTsMs),
              renewAt: new Date(webhookInfo.value.expirationTsMs),
              connectorId: connector.id,
            },
            { transaction: t }
          );
        }

        return connector;
      }
    );
    return new Ok(connector.id.toString());
  } catch (err) {
    logger.error(
      {
        err,
      },
      "Error creating Google Drive connector"
    );
    return new Err(new Error("Error creating Google Drive connector"));
  }
}

export async function updateGoogleDriveConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: NangoConnectionId | null;
  }
): Promise<Result<string, ConnectorsAPIErrorResponse>> {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID not set");
  }

  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err({
      error: {
        message: "Connector not found",
        type: "connector_not_found",
      },
    });
  }

  // Ideally we want to check that the Google Project ID is the same as the one from the connector
  // I couln't find an easy way to access it from the googleapis library
  // Workaround is checking the domain of the user who is updating the connector
  if (connectionId) {
    const oldConnectionId = c.connectionId;
    const currentDriveClient = await getDriveClient(oldConnectionId);
    const currentDriveUser = await currentDriveClient.about.get({
      fields: "user",
    });
    const currentUserEmail = currentDriveUser.data?.user?.emailAddress || "";
    const currentDriveUserDomain = currentUserEmail.split("@")[1];

    const newDriveClient = await getDriveClient(connectionId);
    const newDriveUser = await newDriveClient.about.get({
      fields: "user",
    });
    const newDriveUserEmail = newDriveUser.data?.user?.emailAddress || "";
    const newDriveUserDomain = newDriveUserEmail.split("@")[1];

    if (!currentDriveUserDomain || !newDriveUserDomain) {
      return new Err({
        error: {
          type: "connector_update_error",
          message: "Error retrieving google drive info to update connector",
        },
      });
    }

    if (currentDriveUserDomain !== newDriveUserDomain) {
      return new Err({
        error: {
          type: "connector_oauth_target_mismatch",
          message: "Cannot change domain of a Google Drive connector",
        },
      });
    }

    await c.update({ connectionId });
    nangoDeleteConnection(
      oldConnectionId,
      NANGO_GOOGLE_DRIVE_CONNECTOR_ID
    ).catch((e) => {
      logger.error(
        { error: e, oldConnectionId },
        "Error deleting old Nango connection"
      );
    });
  }

  return new Ok(c.id.toString());
}

export async function cleanupGoogleDriveConnector(
  connectorId: string,
  transaction: Transaction,
  force = false
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
    );
  }
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    return new Err(new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined"));
  }
  if (!GOOGLE_CLIENT_ID) {
    return new Err(new Error("GOOGLE_CLIENT_ID is not defined"));
  }
  if (!GOOGLE_CLIENT_SECRET) {
    return new Err(new Error("GOOGLE_CLIENT_SECRET is not defined"));
  }

  const authClient = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );
  try {
    const credentials = await getGoogleCredentials(connector.connectionId);

    const revokeTokenRes = await authClient.revokeToken(
      credentials.credentials.refresh_token
    );

    if (revokeTokenRes.status !== 200) {
      logger.error(
        {
          error: revokeTokenRes.data,
        },
        "Could not revoke token"
      );
      if (!force) {
        return new Err(new Error("Could not revoke token"));
      }
    }
  } catch (err) {
    if (!force) {
      throw err;
    } else {
      logger.error(
        {
          err,
        },
        "Error revoking token"
      );
    }
  }
  const nangoRes = await nangoDeleteConnection(
    connector.connectionId,
    NANGO_GOOGLE_DRIVE_CONNECTOR_ID
  );
  if (nangoRes.isErr()) {
    if (!force) {
      return nangoRes;
    } else {
      logger.error(
        {
          err: nangoRes.error,
        },
        "Error deleting connection from Nango"
      );
    }
  }

  await GoogleDriveFolders.destroy({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });
  await GoogleDriveFiles.destroy({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });

  await GoogleDriveSyncToken.destroy({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });
  await GoogleDriveWebhook.destroy({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });

  return new Ok(undefined);
}

export async function retrieveGoogleDriveConnectorPermissions(
  connectorId: ModelId,
  parentInternalId: string | null
): Promise<Result<ConnectorResource[], Error>> {
  if (parentInternalId) {
    return new Err(
      new Error(
        "GoogleDrive connector does not support permission retrieval with `parentInternalId`"
      )
    );
  }

  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const folders = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const driveClient = await getDriveClient(c.connectionId);

  const resources: ConnectorResource[] = await Promise.all(
    folders.map((f) => {
      return (async () => {
        const folder = await driveClient.files.get({
          fileId: f.folderId,
          supportsAllDrives: true,
          fields: "id, name, webViewLink, driveId",
        });
        const fd = folder.data;
        if (fd.driveId === f.folderId) {
          const d = await driveClient.drives.get({
            driveId: f.folderId,
          });
          fd.name = d.data.name;
        }
        return {
          provider: c.type,
          internalId: f.folderId,
          parentInternalId: null,
          type: "folder" as ConnectorResourceType,
          title: fd.name || "",
          sourceUrl: fd.webViewLink || null,
          expandable: false,
          permission: "read" as ConnectorPermission,
        };
      })();
    })
  );

  return new Ok(resources);
}
