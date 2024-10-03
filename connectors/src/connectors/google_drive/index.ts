import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
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
import type { drive_v3 } from "googleapis";
import type { GaxiosResponse, OAuth2Client } from "googleapis-common";
import type { InferAttributes, WhereOptions } from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import {
  getLocalParents,
  isDriveObjectExpandable,
} from "@connectors/connectors/google_drive/lib";
import { GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID } from "@connectors/connectors/google_drive/lib/consts";
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
} from "@connectors/connectors/google_drive/temporal/utils";
import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { GoogleDriveSheet } from "@connectors/lib/models/google_drive";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
  GoogleDriveFolders,
} from "@connectors/lib/models/google_drive";
import { syncSucceeded } from "@connectors/lib/sync_status";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";
import { FILE_ATTRIBUTES_TO_FETCH } from "@connectors/types/google_drive";

import { folderHasChildren, getDrives } from "./temporal/activities";
import {
  launchGoogleDriveFullSyncWorkflow,
  launchGoogleDriveIncrementalSyncWorkflow,
  launchGoogleGarbageCollector,
} from "./temporal/client";

export class GoogleDriveConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError>> {
    const driveClient = await getDriveClient(connectionId);

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

    const googleDriveConfigurationBlob = {
      pdfEnabled: false,
      largeFilesEnabled: false,
      csvEnabled: false,
    };

    const connector = await ConnectorResource.makeNew(
      "google_drive",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      googleDriveConfigurationBlob
    );

    // We mark it artificially as sync succeeded as google drive is created empty.
    await syncSucceeded(connector.id);

    // We nonetheless launch the incremental sync.
    const res = await launchGoogleDriveIncrementalSyncWorkflow(connector.id);
    if (res.isErr()) {
      throw res.error;
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorsAPIError>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
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
        const currentUserEmail =
          currentDriveUser.data?.user?.emailAddress || "";
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

      await connector.update({ connectionId });
    }

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    // Google revocation requires refresh tokens so would have to happen in `oauth`. But Google
    // Drive does not rely on webhooks anymore so we can just delete the connector.

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Google Drive connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
    viewType,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    const isTablesView = viewType === "tables";
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
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
            connectorId: this.connectorId,
          },
        });

        const folderAsContentNodes = await getFoldersAsContentNodes({
          authCredentials,
          folders,
          viewType,
        });

        const nodes = removeNulls(folderAsContentNodes);

        nodes.sort((a, b) => {
          return a.title.localeCompare(b.title);
        });

        return new Ok(nodes);
      } else {
        // Return the list of all folders and files synced in a parent folder.
        const where: WhereOptions<InferAttributes<GoogleDriveFiles>> = {
          connectorId: this.connectorId,
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
              connectorId: this.connectorId,
              driveFileId: parentInternalId,
            },
          });
        }

        let nodes = await concurrentExecutor(
          folderOrFiles,
          async (f): Promise<ContentNode> => {
            const type = getPermissionViewType(f);

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
                connectorId: this.connectorId,
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
                dustTableId: getGoogleSheetTableId(
                  s.driveFileId,
                  s.driveSheetId
                ),
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
        const drives = await getDrives(c.id);

        const nodes: ContentNode[] = await Promise.all(
          drives.map(async (d): Promise<ContentNode> => {
            const driveObject = await getGoogleDriveObject(
              authCredentials,
              d.id
            );
            if (!driveObject) {
              throw new Error(
                `Drive ${d.id} unexpectedly not found (got 404).`
              );
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
              expandable: await folderHasChildren(
                this.connectorId,
                driveObject.id
              ),
              permission: (await GoogleDriveFolders.findOne({
                where: {
                  connectorId: this.connectorId,
                  folderId: driveObject.id,
                },
              }))
                ? "read"
                : "none",
            };
          })
        );
        // Adding a fake "Shared with me" node, to allow the user to see their shared files
        // that are not living in a shared drive.
        nodes.push({
          provider: c.type,
          internalId: GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID,
          parentInternalId: null,
          type: "folder" as const,
          preventSelection: true,
          title: "Shared with me",
          sourceUrl: null,
          dustDocumentId: null,
          lastUpdatedAt: null,
          expandable: true,
          permission: "none",
        });

        nodes.sort((a, b) => {
          return a.title.localeCompare(b.title);
        });

        return new Ok(nodes);
      } else {
        // Return the list of remote folders inside a parent folder.
        const drive = await getDriveClient(authCredentials);
        let nextPageToken: string | undefined = undefined;
        let remoteFolders: drive_v3.Schema$File[] = [];
        // Depending on the view the user is requesting, the way of querying changes.
        // The "Shared with me" view requires to look for folders
        // with the flag `sharedWithMe=true`, but there is no need to check for the parents.
        let gdriveQuery = `mimeType='application/vnd.google-apps.folder'`;
        if (parentInternalId === GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID) {
          gdriveQuery += ` and sharedWithMe=true`;
        } else {
          gdriveQuery += ` and '${parentInternalId}' in parents`;
        }
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
              q: gdriveQuery,
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
            const driveObject = await driveObjectToDustType(
              rf,
              authCredentials
            );

            return {
              provider: c.type,
              internalId: driveObject.id,
              parentInternalId: driveObject.parent,
              type: "folder" as const,
              title: driveObject.name,
              sourceUrl: driveObject.webViewLink || null,
              expandable: await folderHasChildren(
                this.connectorId,
                driveObject.id
              ),
              dustDocumentId: null,
              lastUpdatedAt: driveObject.updatedAtMs || null,
              permission: (await GoogleDriveFolders.findOne({
                where: {
                  connectorId: this.connectorId,
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

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    const addedFolderIds: string[] = [];
    const removedFolderIds: string[] = [];
    for (const [id, permission] of Object.entries(permissions)) {
      if (permission === "none") {
        removedFolderIds.push(id);
        await GoogleDriveFolders.destroy({
          where: {
            connectorId: this.connectorId,
            folderId: id,
          },
        });
      } else if (permission === "read") {
        addedFolderIds.push(id);
        await GoogleDriveFolders.upsert({
          connectorId: this.connectorId,
          folderId: id,
        });
      } else {
        return new Err(
          new Error(`Invalid permission ${permission} for node ${id}`)
        );
      }
    }

    if (addedFolderIds.length > 0) {
      const res = await launchGoogleDriveFullSyncWorkflow(
        this.connectorId,
        null,
        addedFolderIds
      );
      if (res.isErr()) {
        return res;
      }
    } else if (removedFolderIds.length > 0) {
      // If we have added folders, the garbage collector will be automatically at the end of the full sync,
      // but if we only removed folders, we need launch it manually.
      const res = await launchGoogleGarbageCollector(this.connectorId);
      if (res.isErr()) {
        return res;
      }
    }
    const incrementalRes = await launchGoogleDriveIncrementalSyncWorkflow(
      this.connectorId
    );
    if (incrementalRes.isErr()) {
      return incrementalRes;
    }

    return new Ok(undefined);
  }

  async retrieveBatchContentNodes({
    internalIds,
    viewType,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
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
            connectorId: this.connectorId,
            driveFileId: driveFileIds,
          },
        })
      : [];

    const drivesOrTopLevelFolders = driveFileIds.length
      ? (
          await GoogleDriveFolders.findAll({
            where: {
              connectorId: this.connectorId,
              folderId: driveFileIds,
            },
          })
        ).filter(
          // no need to add it if already in folderOrFiles
          (f) => folderOrFiles.every((ff) => ff.driveFileId !== f.folderId)
        )
      : [];

    const sheets = sheetIds.length
      ? await GoogleDriveSheet.findAll({
          where: {
            connectorId: this.connectorId,
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
        const type = getPermissionViewType(f);
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
            connectorId: this.connectorId,
            viewType,
          }),
          permission: "read",
        };
      },
      { concurrency: 4 }
    );

    const drivesOrTopLevelFolderNodes = await (async () => {
      if (drivesOrTopLevelFolders.length === 0) {
        return [];
      }
      const c = await ConnectorResource.fetchById(this.connectorId);
      if (!c) {
        logger.error({ connectorId: this.connectorId }, "Connector not found");
        throw new Error("Connector not found");
      }
      const authCredentials = await getAuthObject(c.connectionId);
      return removeNulls(
        await getFoldersAsContentNodes({
          authCredentials,
          folders: drivesOrTopLevelFolders,
          viewType,
        })
      );
    })();

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
      [...folderOrFileNodes, ...drivesOrTopLevelFolderNodes, ...sheetNodes].map(
        (n) => [n.internalId, n]
      )
    );
    return new Ok(
      internalIds
        .filter((id) => nodeByInternalId.has(id))
        .map((id) => {
          const node = nodeByInternalId.get(id);
          if (!node) {
            throw new Error(`Could not find node with internalId ${id}`);
          }
          return node;
        })
    );
  }

  async retrieveContentNodeParents({
    internalId,
    memoizationKey,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const memo = memoizationKey || uuidv4();
    try {
      const parents = await getLocalParents(this.connectorId, internalId, memo);
      return new Ok(parents);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }
    const config = await GoogleDriveConfig.findOne({
      where: { connectorId: this.connectorId },
    });
    if (!config) {
      return new Err(
        new Error(
          `Google Drive config not found with connectorId ${this.connectorId}`
        )
      );
    }

    if (!["true", "false"].includes(configValue)) {
      return new Err(
        new Error(`Invalid config value ${configValue}, must be true or false`)
      );
    }

    switch (configKey) {
      case "pdfEnabled": {
        await config.update({
          pdfEnabled: configValue === "true",
        });
        const workflowRes = await launchGoogleDriveFullSyncWorkflow(
          this.connectorId,
          null,
          []
        );
        if (workflowRes.isErr()) {
          return workflowRes;
        }
        return new Ok(void 0);
      }
      case "csvEnabled": {
        await config.update({
          csvEnabled: configValue === "true",
        });
        const workflowRes = await launchGoogleDriveFullSyncWorkflow(
          this.connectorId,
          null,
          []
        );
        if (workflowRes.isErr()) {
          return workflowRes;
        }
        return new Ok(void 0);
      }
      case "largeFilesEnabled": {
        await config.update({
          largeFilesEnabled: configValue === "true",
        });
        const workflowRes = await launchGoogleDriveFullSyncWorkflow(
          this.connectorId,
          null,
          []
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

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }
    const config = await GoogleDriveConfig.findOne({
      where: { connectorId: this.connectorId },
    });
    if (!config) {
      return new Err(
        new Error(
          `Google Drive config not found with connectorId ${this.connectorId}`
        )
      );
    }
    switch (configKey) {
      case "pdfEnabled": {
        return new Ok(config.pdfEnabled ? "true" : "false");
      }
      case "largeFilesEnabled": {
        return new Ok(config.largeFilesEnabled ? "true" : "false");
      }
      case "csvEnabled": {
        return new Ok(config.csvEnabled ? "true" : "false");
      }
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    return launchGoogleGarbageCollector(this.connectorId);
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }
    await connector.markAsPaused();
    await terminateAllWorkflowsForConnectorId(this.connectorId);
    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }
    await connector.markAsUnpaused();
    const r = await launchGoogleDriveFullSyncWorkflow(
      this.connectorId,
      null,
      []
    );
    if (r.isErr()) {
      return r;
    }
    const incrementalSync = await launchGoogleDriveIncrementalSyncWorkflow(
      this.connectorId
    );
    if (incrementalSync.isErr()) {
      return incrementalSync;
    }
    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    await terminateAllWorkflowsForConnectorId(this.connectorId);
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const res = await launchGoogleDriveIncrementalSyncWorkflow(
      this.connectorId
    );
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    return launchGoogleDriveFullSyncWorkflow(this.connectorId, fromTs, []);
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}

async function getFoldersAsContentNodes({
  authCredentials,
  folders,
  viewType,
}: {
  authCredentials: OAuth2Client;
  folders: GoogleDriveFolders[];
  viewType: ContentNodesViewType;
}) {
  return concurrentExecutor(
    folders,
    async (f): Promise<ContentNode | null> => {
      const fd = await getGoogleDriveObject(authCredentials, f.folderId);
      if (!fd) {
        return null;
      }
      const sourceUrl = `https://drive.google.com/drive/folders/${f.folderId}`;
      return {
        provider: "google_drive",
        internalId: f.folderId,
        parentInternalId: null,
        type: "folder",
        title: fd.name || "",
        sourceUrl,
        dustDocumentId: null,
        lastUpdatedAt: fd.updatedAtMs || null,
        expandable: await isDriveObjectExpandable({
          objectId: f.folderId,
          mimeType: "application/vnd.google-apps.folder",
          connectorId: f.connectorId,
          viewType,
        }),
        permission: "read",
      };
    },
    { concurrency: 4 }
  );
}
