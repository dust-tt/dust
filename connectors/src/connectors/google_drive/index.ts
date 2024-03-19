import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import type { GaxiosResponse } from "googleapis-common";

import {
  getLocalParents,
  isDriveObjectExpandable,
  registerWebhook,
} from "@connectors/connectors/google_drive/lib";
import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { GoogleDriveSheet } from "@connectors/lib/models/google_drive";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveWebhook,
} from "@connectors/lib/models/google_drive";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import { folderHasChildren, getDrivesIds } from "./temporal/activities";
import {
  launchGoogleDriveFullSyncWorkflow,
  launchGoogleGarbageCollector,
} from "./temporal/client";
export type NangoConnectionId = string;
import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  ModelId,
  Result,
} from "@dust-tt/types";
import {
  Err,
  getGoogleIdsFromSheetContentNodeInternalId,
  getGoogleSheetContentNodeInternalId,
  getGoogleSheetTableId,
  isGoogleSheetContentNodeInternalId,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import type { InferAttributes, WhereOptions } from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { googleDriveConfig } from "@connectors/connectors/google_drive/lib/config";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import {
  getGoogleDriveEntityDocumentId,
  getPermissionViewType,
} from "@connectors/connectors/google_drive/lib/permissions";
import {
  isGoogleDriveFolder,
  isGoogleDriveSpreadSheetFile,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  driveObjectToDustType,
  getAuthObject,
  getDriveClient,
  getGoogleCredentials,
} from "@connectors/connectors/google_drive/temporal/utils";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { FILE_ATTRIBUTES_TO_FETCH } from "@connectors/types/google_drive";

export async function createGoogleDriveConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  try {
    const driveClient = await getDriveClient(nangoConnectionId);

    // Sanity checks to confirm we have sufficient permissions.
    const [sanityCheckAbout, sanityCheckFilesGet, sanityCheckFilesList] =
      await Promise.all([
        driveClient.about.get({ fields: "*" }),
        driveClient.files.get({ fileId: "root" }),
        driveClient.drives.list({
          pageSize: 10,
          fields: "nextPageToken, drives(id, name)",
        }),
      ]);

    if (sanityCheckAbout.status !== 200) {
      throw new Error(
        `Could not get google drive info. Error message: ${
          sanityCheckAbout.statusText || "unknown"
        }`
      );
    }
    if (sanityCheckFilesGet.status !== 200) {
      throw new Error(
        `Could not call google drive files get. Error message: ${
          sanityCheckFilesGet.statusText || "unknown"
        }`
      );
    }
    if (sanityCheckFilesList.status !== 200) {
      throw new Error(
        `Could not call google drive files list. Error message: ${
          sanityCheckFilesList.statusText || "unknown"
        }`
      );
    }
  } catch (err) {
    logger.error(
      {
        err,
      },
      "Error creating Google Drive connector"
    );
    return new Err(new Error("Error creating Google Drive connector"));
  }

  const googleDriveConfigurationBlob = {
    pdfEnabled: false,
  };

  const connector = await ConnectorResource.makeNew(
    "google_drive",
    {
      connectionId: nangoConnectionId,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
    googleDriveConfigurationBlob
  );

  try {
    const webhookInfo = await registerWebhook(connector);
    if (webhookInfo.isErr()) {
      await connector.delete();
      throw webhookInfo.error;
    } else {
      await GoogleDriveWebhook.create({
        webhookId: webhookInfo.value.id,
        expiresAt: new Date(webhookInfo.value.expirationTsMs),
        renewAt: new Date(webhookInfo.value.expirationTsMs),
        connectorId: connector.id,
      });
    }

    return new Ok(connector.id.toString());
  } catch (err) {
    await connector.delete();
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
): Promise<Result<string, ConnectorsAPIError>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return new Err({
      message: "Connector not found",
      type: "connector_not_found",
    });
  }

  // Ideally we want to check that the Google Project ID is the same as the one from the connector
  // I couln't find an easy way to access it from the googleapis library
  // Workaround is checking the domain of the user who is updating the connector
  if (connectionId) {
    try {
      const oldConnectionId = connector.connectionId;
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
          type: "connector_update_error",
          message: "Error retrieving google drive info to update connector",
        });
      }

      if (currentDriveUserDomain !== newDriveUserDomain) {
        return new Err({
          type: "connector_oauth_target_mismatch",
          message: "Cannot change domain of a Google Drive connector",
        });
      }
    } catch (e) {
      logger.error(
        {
          error: e,
        },
        `Error checking Google domain of user who is updating the connector - lets update the connector regardless`
      );
    }

    const oldConnectionId = connector.connectionId;
    await connector.update({ connectionId });

    nangoDeleteConnection(
      oldConnectionId,
      googleDriveConfig.getRequiredNangoGoogleDriveConnectorId()
    ).catch((e) => {
      logger.error(
        { error: e, oldConnectionId },
        "Error deleting old Nango connection"
      );
    });
  }

  return new Ok(connector.id.toString());
}

export async function cleanupGoogleDriveConnector(
  connectorId: ModelId,
  force = false
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
    );
  }

  const authClient = new google.auth.OAuth2(
    googleDriveConfig.getRequiredGoogleDriveClientId(),
    googleDriveConfig.getRequiredGoogleDriveClientSecret()
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
    googleDriveConfig.getRequiredNangoGoogleDriveConnectorId()
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

  const res = await connector.delete();
  if (res.isErr()) {
    logger.error(
      { connectorId, error: res.error },
      "Error cleaning up Google Drive connector."
    );
    return res;
  }

  return new Ok(undefined);
}

export async function retrieveGoogleDriveConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
  viewType,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  const c = await ConnectorResource.fetchById(connectorId);
  const isTablesView = viewType === "tables";
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }
  const authCredentials = await getAuthObject(c.connectionId);
  if (isTablesView && filterPermission !== "read") {
    return new Err(
      new Error("Tables view is only supported for read permissions")
    );
  }
  if (filterPermission === "read") {
    if (parentInternalId === null) {
      // Return the list of folders explicitly selected by the user.
      const folders = await GoogleDriveFolders.findAll({
        where: {
          connectorId: connectorId,
        },
      });

      const folderAsContentNodes = await concurrentExecutor(
        folders,
        async (f): Promise<ContentNode | null> => {
          const fd = await getGoogleDriveObject(authCredentials, f.folderId);
          if (!fd) {
            return null;
          }
          return {
            provider: c.type,
            internalId: f.folderId,
            parentInternalId: null,
            type: "folder",
            title: fd.name || "",
            sourceUrl: null, // Out of consistency we don't send `fd.webViewLink`.
            dustDocumentId: null,
            lastUpdatedAt: fd.updatedAtMs || null,
            expandable: await isDriveObjectExpandable({
              objectId: f.folderId,
              mimeType: "application/vnd.google-apps.folder",
              connectorId,
              viewType,
            }),
            permission: "read",
          };
        },
        { concurrency: 4 }
      );

      const nodes = removeNulls(folderAsContentNodes);

      nodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(nodes);
    } else {
      // Return the list of all folders and files synced in a parent folder.
      const where: WhereOptions<InferAttributes<GoogleDriveFiles>> = {
        connectorId: connectorId,
        parentId: parentInternalId,
      };
      if (isTablesView) {
        // In tables view, we only show folders, spreadhsheets and sheets.
        // We filter out folders that only contain Documents.
        where.mimeType = [
          "application/vnd.google-apps.folder",
          "application/vnd.google-apps.spreadsheet",
        ];
      }
      const folderOrFiles = await GoogleDriveFiles.findAll({
        where,
      });
      let sheets: GoogleDriveSheet[] = [];
      if (isTablesView) {
        sheets = await GoogleDriveSheet.findAll({
          where: {
            driveFileId: parentInternalId,
          },
        });
      }

      let nodes = await concurrentExecutor(
        folderOrFiles,
        async (f): Promise<ContentNode> => {
          const type = getPermissionViewType(f, viewType);

          return {
            provider: c.type,
            internalId: f.driveFileId,
            parentInternalId: null,
            type,
            title: f.name || "",
            dustDocumentId: getGoogleDriveEntityDocumentId(f),
            lastUpdatedAt: f.lastUpsertedTs?.getTime() || null,
            sourceUrl: null,
            expandable: await isDriveObjectExpandable({
              objectId: f.driveFileId,
              mimeType: f.mimeType,
              connectorId,
              viewType,
            }),
            permission: "read",
          };
        },
        { concurrency: 4 }
      );

      if (sheets.length) {
        nodes = nodes.concat(
          sheets.map((s) => {
            return {
              provider: c.type,
              internalId: getGoogleSheetContentNodeInternalId(
                s.driveFileId,
                s.driveSheetId
              ),
              parentInternalId: s.driveFileId,
              type: "database" as const,
              title: s.name || "",
              dustDocumentId: null,
              lastUpdatedAt: s.updatedAt.getTime() || null,
              sourceUrl: null,
              expandable: false,
              permission: "read",
              dustTableId: getGoogleSheetTableId(s.driveFileId, s.driveSheetId),
            };
          })
        );
      }

      // Sorting nodes, folders first then alphabetically.
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.title.localeCompare(b.title);
      });

      return new Ok(nodes);
    }
  } else if (filterPermission === null) {
    if (parentInternalId === null) {
      // Return the list of remote shared drives.
      const drives = await getDrivesIds(c.id);

      const nodes: ContentNode[] = await Promise.all(
        drives.map(async (d): Promise<ContentNode> => {
          const driveObject = await getGoogleDriveObject(authCredentials, d.id);
          if (!driveObject) {
            throw new Error(`Drive ${d.id} unexpectedly not found (got 404).`);
          }
          return {
            provider: c.type,
            internalId: driveObject.id,
            parentInternalId: driveObject.parent,
            type: "folder" as const,
            title: driveObject.name,
            sourceUrl: driveObject.webViewLink || null,
            dustDocumentId: null,
            lastUpdatedAt: driveObject.updatedAtMs || null,
            expandable: await folderHasChildren(connectorId, driveObject.id),
            permission: (await GoogleDriveFolders.findOne({
              where: {
                connectorId: connectorId,
                folderId: driveObject.id,
              },
            }))
              ? "read"
              : "none",
          };
        })
      );

      nodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(nodes);
    } else {
      // Return the list of remote folders inside a parent folder.
      const drive = await getDriveClient(authCredentials);
      let nextPageToken: string | undefined = undefined;
      let remoteFolders: drive_v3.Schema$File[] = [];
      do {
        const res: GaxiosResponse<drive_v3.Schema$FileList> =
          await drive.files.list({
            corpora: "allDrives",
            pageSize: 200,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: `nextPageToken, files(${FILE_ATTRIBUTES_TO_FETCH.join(
              ", "
            )})`,
            q: `'${parentInternalId}' in parents and mimeType='application/vnd.google-apps.folder'`,
            pageToken: nextPageToken,
          });

        if (res.status !== 200) {
          throw new Error(
            `Error getting files. status_code: ${res.status}. status_text: ${res.statusText}`
          );
        }
        if (!res.data.files) {
          throw new Error("Files list is undefined");
        }
        remoteFolders = remoteFolders.concat(res.data.files);
        nextPageToken = res.data.nextPageToken || undefined;
      } while (nextPageToken);

      const nodes: ContentNode[] = await Promise.all(
        remoteFolders.map(async (rf): Promise<ContentNode> => {
          const driveObject = await driveObjectToDustType(rf, authCredentials);

          return {
            provider: c.type,
            internalId: driveObject.id,
            parentInternalId: driveObject.parent,
            type: "folder" as const,
            title: driveObject.name,
            sourceUrl: driveObject.webViewLink || null,
            expandable: await folderHasChildren(connectorId, driveObject.id),
            dustDocumentId: null,
            lastUpdatedAt: driveObject.updatedAtMs || null,
            permission: (await GoogleDriveFolders.findOne({
              where: {
                connectorId: connectorId,
                folderId: driveObject.id,
              },
            }))
              ? "read"
              : "none",
          };
        })
      );

      nodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(nodes);
    }
  } else {
    return new Err(new Error(`Invalid permission: ${filterPermission}`));
  }
}

export async function setGoogleDriveConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  let shouldFullSync = false;
  for (const [id, permission] of Object.entries(permissions)) {
    shouldFullSync = true;
    if (permission === "none") {
      await GoogleDriveFolders.destroy({
        where: {
          connectorId: connectorId,
          folderId: id,
        },
      });
    } else if (permission === "read") {
      await GoogleDriveFolders.upsert({
        connectorId: connectorId,
        folderId: id,
      });
    } else {
      return new Err(
        new Error(`Invalid permission ${permission} for node ${id}`)
      );
    }
  }

  if (shouldFullSync) {
    await launchGoogleDriveFullSyncWorkflow(connectorId, null);
  }

  return new Ok(undefined);
}

export async function retrieveGoogleDriveContentNodes(
  connectorId: ModelId,
  internalIds: string[],
  viewType: ContentNodesViewType
): Promise<Result<ContentNode[], Error>> {
  const driveFileIds = internalIds.filter(
    (id) => !isGoogleSheetContentNodeInternalId(id)
  );
  const sheetIds = internalIds
    .filter((id) => isGoogleSheetContentNodeInternalId(id))
    .map(getGoogleIdsFromSheetContentNodeInternalId);

  if (!!sheetIds.length && viewType !== "tables") {
    return new Err(
      new Error(
        `Cannot retrieve Google Sheets Content Nodes in view type "${viewType}".`
      )
    );
  }

  const folderOrFiles = driveFileIds.length
    ? await GoogleDriveFiles.findAll({
        where: {
          connectorId: connectorId,
          driveFileId: driveFileIds,
        },
      })
    : [];
  const sheets = sheetIds.length
    ? await GoogleDriveSheet.findAll({
        where: {
          [Op.or]: sheetIds.map((s) => ({
            [Op.and]: [
              {
                driveFileId: s.googleFileId,
              },
              {
                driveSheetId: s.googleSheetId,
              },
            ],
          })),
        },
      })
    : [];

  const folderOrFileNodes = await concurrentExecutor(
    folderOrFiles,
    async (f): Promise<ContentNode> => {
      const type = getPermissionViewType(f, viewType);
      let sourceUrl = null;

      if (isGoogleDriveSpreadSheetFile(f)) {
        sourceUrl = `https://docs.google.com/spreadsheets/d/${f.driveFileId}/edit`;
      } else if (isGoogleDriveFolder(f)) {
        sourceUrl = `https://drive.google.com/drive/folders/${f.driveFileId}`;
      } else {
        sourceUrl = `https://drive.google.com/file/d/${f.driveFileId}/view`;
      }

      return {
        provider: "google_drive",
        internalId: f.driveFileId,
        parentInternalId: null,
        type,
        title: f.name || "",
        dustDocumentId: getGoogleDriveEntityDocumentId(f),
        lastUpdatedAt: f.lastUpsertedTs?.getTime() || null,
        sourceUrl,
        expandable: await isDriveObjectExpandable({
          objectId: f.driveFileId,
          mimeType: f.mimeType,
          connectorId,
          viewType,
        }),
        permission: "read",
      };
    },
    { concurrency: 4 }
  );

  const sheetNodes: ContentNode[] = sheets.map((s) => ({
    provider: "google_drive",
    internalId: getGoogleSheetContentNodeInternalId(
      s.driveFileId,
      s.driveSheetId
    ),
    parentInternalId: s.driveFileId,
    type: "database",
    title: s.name || "",
    dustDocumentId: null,
    lastUpdatedAt: s.updatedAt.getTime() || null,
    sourceUrl: `https://docs.google.com/spreadsheets/d/${s.driveFileId}/edit#gid=${s.driveSheetId}`,
    expandable: false,
    permission: "read",
  }));

  // Return the nodes in the same order as the input internalIds.
  const nodeByInternalId = new Map(
    [...folderOrFileNodes, ...sheetNodes].map((n) => [n.internalId, n])
  );
  return new Ok(
    internalIds.map((id) => {
      const node = nodeByInternalId.get(id);
      if (!node) {
        throw new Error(`Could not find node with internalId ${id}`);
      }
      return node;
    })
  );
}

export async function retrieveGoogleDriveContentNodeParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  const memo = memoizationKey || uuidv4();
  try {
    const parents = await getLocalParents(connectorId, internalId, memo);
    return new Ok(parents);
  } catch (err) {
    return new Err(err as Error);
  }
}

export async function getGoogleDriveConfig(
  connectorId: ModelId,
  configKey: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }
  const config = await GoogleDriveConfig.findOne({
    where: { connectorId: connectorId },
  });
  if (!config) {
    return new Err(
      new Error(`Google Drive config not found with connectorId ${connectorId}`)
    );
  }
  switch (configKey) {
    case "pdfEnabled": {
      return new Ok(config.pdfEnabled ? "true" : "false");
    }
    default:
      return new Err(new Error(`Invalid config key ${configKey}`));
  }
}

export async function setGoogleDriveConfig(
  connectorId: ModelId,
  configKey: string,
  configValue: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }
  const config = await GoogleDriveConfig.findOne({
    where: { connectorId: connectorId },
  });
  if (!config) {
    return new Err(
      new Error(`Google Drive config not found with connectorId ${connectorId}`)
    );
  }
  switch (configKey) {
    case "pdfEnabled": {
      if (!["true", "false"].includes(configValue)) {
        return new Err(
          new Error(
            `Invalid config value ${configValue}, must be true or false`
          )
        );
      }
      await config.update({
        pdfEnabled: configValue === "true",
      });
      const workflowRes = await launchGoogleDriveFullSyncWorkflow(
        connectorId,
        null
      );
      if (workflowRes.isErr()) {
        return workflowRes;
      }
      return new Ok(void 0);
    }

    default: {
      return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }
}

export async function googleDriveGarbageCollect(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  return launchGoogleGarbageCollector(connectorId);
}
