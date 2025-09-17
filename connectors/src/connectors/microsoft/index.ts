import type { ConnectorProvider, Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";
import { Client } from "@microsoft/microsoft-graph-client";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import {
  getChannelAsContentNode,
  getDriveAsContentNode,
  getFolderAsContentNode,
  getMicrosoftNodeAsContentNode,
  getSiteAsContentNode,
  getSitesRootAsContentNode,
  getTeamAsContentNode,
  getTeamsRootAsContentNode,
} from "@connectors/connectors/microsoft/lib/content_nodes";
import {
  clientApiGet,
  getAllPaginatedEntities,
  getChannels,
  getDrives,
  getFilesAndFolders,
  getSites,
  getSubSites,
  getTeams,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import {
  internalIdFromTypeAndPath,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import {
  getRootNodesToSyncFromResources,
  populateDeltas,
} from "@connectors/connectors/microsoft/temporal/activities";
import {
  launchMicrosoftFullSyncWorkflow,
  launchMicrosoftGarbageCollectionWorkflow,
  launchMicrosoftIncrementalSyncWorkflow,
} from "@connectors/connectors/microsoft/temporal/client";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import { syncSucceeded } from "@connectors/lib/sync_status";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import logger, { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  MicrosoftConfigurationResource,
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  DataSourceConfig,
} from "@connectors/types";

export class MicrosoftConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "microsoft";

  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const client = await getClient(connectionId);

    try {
      // Sanity checks - check connectivity and permissions. User should be able to access the sites and teams list.
      await getSites(logger, client);
    } catch (err) {
      logger.error(
        {
          err,
        },
        "Error creating Microsoft connector"
      );
      throw new Error("Error creating Microsoft connector");
    }

    const microsoftConfigurationBlob = {
      pdfEnabled: false,
      csvEnabled: false,
      largeFilesEnabled: false,
    };

    const connector = await ConnectorResource.makeNew(
      "microsoft",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      microsoftConfigurationBlob
    );

    await syncSucceeded(connector.id);

    const res = await launchMicrosoftIncrementalSyncWorkflow(connector.id);
    if (res.isErr()) {
      throw res.error;
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    // Check that we don't switch tenants
    if (connectionId) {
      try {
        const logger = getActivityLogger(connector);
        const client = await getClient(connector.connectionId);
        const currentOrg = await clientApiGet(logger, client, "/organization");

        const newClient = await getClient(connectionId);
        const newOrg = await clientApiGet(logger, newClient, "/organization");

        if (
          !currentOrg?.value ||
          !newOrg?.value ||
          currentOrg.value.length === 0 ||
          newOrg.value.length === 0
        ) {
          throw new Error(
            "Error retrieving organization info to update connector"
          );
        }

        if (currentOrg.value[0].id !== newOrg.value[0].id) {
          return new Err(
            new ConnectorManagerError(
              "CONNECTOR_OAUTH_TARGET_MISMATCH",
              "Cannot change domain of a Microsoft connector"
            )
          );
        }
      } catch (e) {
        logger.error(
          {
            error: e,
          },
          "Error checking Microsoft organization - lets update the connector regardless"
        );
      }

      await connector.update({ connectionId });

      // If connector was previously paused, unpause it.
      if (connector.isPaused()) {
        await this.unpauseAndResume();
      }
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

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Microsoft connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async sync({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    return launchMicrosoftFullSyncWorkflow(this.connectorId);
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
    viewType,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const logger = getActivityLogger(connector);

    const isTablesView = viewType === "table";
    if (filterPermission === "read" || isTablesView) {
      if (!parentInternalId) {
        const roots = await MicrosoftRootResource.listRootsByConnectorId(
          connector.id
        );
        const nodes = await MicrosoftNodeResource.fetchByInternalIds(
          this.connectorId,
          roots.map((r) => r.internalId)
        );
        return new Ok(
          nodes.map((node) => getMicrosoftNodeAsContentNode(node, isTablesView))
        );
      }
      const node = await MicrosoftNodeResource.fetchByInternalId(
        this.connectorId,
        parentInternalId
      );
      if (!node) {
        return new Err(
          new ConnectorManagerError(
            "INVALID_PARENT_INTERNAL_ID",
            `Could not find node with id ${parentInternalId}`
          )
        );
      }
      const nRes = await retrieveChildrenNodes(node, isTablesView);
      if (nRes.isErr()) {
        throw nRes.error;
      }
      return new Ok(nRes.value);
    }

    const client = await getClient(connector.connectionId);
    const nodes = [];

    const selectedResources = (
      await MicrosoftRootResource.listRootsByConnectorId(connector.id)
    ).map((r) => r.internalId);

    // at the time, we only sync sharepoint sites and drives, not team channels
    // work on teams has been started here and in graph_api.ts but is not yet
    // user facing
    if (!parentInternalId) {
      parentInternalId = internalIdFromTypeAndPath({
        nodeType: "root",
        itemAPIPath: "",
      });
    }

    const { nodeType } = typeAndPathFromInternalId(parentInternalId);

    try {
      switch (nodeType) {
        case "root": {
          nodes.push(getSitesRootAsContentNode());
          nodes.push(getTeamsRootAsContentNode());
          break;
        }
        case "sites-root": {
          const sites = await getAllPaginatedEntities((nextLink) =>
            getSites(logger, client, nextLink)
          );
          nodes.push(...sites.map((n) => getSiteAsContentNode(n)));
          break;
        }
        case "teams-root": {
          const teams = await getAllPaginatedEntities((nextLink) =>
            getTeams(logger, client, nextLink)
          );
          nodes.push(...teams.map((n) => getTeamAsContentNode(n)));
          break;
        }
        case "team": {
          const channels = await getAllPaginatedEntities((nextLink) =>
            getChannels(logger, client, parentInternalId, nextLink)
          );
          nodes.push(
            ...channels.map((n) => getChannelAsContentNode(n, parentInternalId))
          );
          break;
        }
        case "site": {
          const subSites = await getAllPaginatedEntities((nextLink) =>
            getSubSites(logger, client, parentInternalId, nextLink)
          );
          const drives = await getAllPaginatedEntities((nextLink) =>
            getDrives(logger, client, parentInternalId, nextLink)
          );
          nodes.push(
            ...subSites.map((n) => getSiteAsContentNode(n, parentInternalId)),
            ...drives.map((n) => getDriveAsContentNode(n, parentInternalId))
          );
          break;
        }
        case "drive":
        case "folder": {
          const filesAndFolders = await getAllPaginatedEntities((nextLink) =>
            getFilesAndFolders(logger, client, parentInternalId, nextLink)
          );
          const folders = filesAndFolders.filter((n) => n.folder);
          nodes.push(
            ...folders.map((n) => getFolderAsContentNode(n, parentInternalId))
          );
          break;
        }
        case "channel":
        case "file":
        case "page":
        case "message":
        case "worksheet":
          throw new Error(
            `Unexpected node type ${nodeType} for retrievePermissions`
          );
        default: {
          assertNever(nodeType);
        }
      }

      const nodesWithPermissions = nodes.map((res) => {
        return {
          ...res,
          permission: (selectedResources.includes(res.internalId) ||
          (res.parentInternalId &&
            selectedResources.includes(res.parentInternalId))
            ? "read"
            : "none") as ConnectorPermission,
        };
      });

      if (filterPermission) {
        return new Ok(
          nodesWithPermissions.filter((n) => n.permission === filterPermission)
        );
      }
      return new Ok(nodesWithPermissions);
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        return new Err(
          new ConnectorManagerError(
            "EXTERNAL_OAUTH_TOKEN_ERROR",
            "Microsoft authorization error, please re-authorize."
          )
        );
      }
      // Unanhdled error, throwing to get a 500.
      throw e;
    }
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const existing = await MicrosoftRootResource.listRootsByConnectorId(
      connector.id
    );

    const nodeIdsToDelete = Object.keys(permissions).filter(
      (internalId) =>
        permissions[internalId] === "none" &&
        existing.some((e) => e.internalId === internalId)
    );
    if (nodeIdsToDelete.length > 0) {
      await MicrosoftRootResource.batchDelete({
        resourceIds: nodeIdsToDelete,
        connectorId: connector.id,
      });
    }

    const newResourcesBlobs = Object.entries(permissions)
      .filter(
        ([internalId, permission]) =>
          permission === "read" &&
          existing.every((e) => e.internalId !== internalId)
      )
      .map(([internalId]) => ({
        connectorId: connector.id,
        nodeType: typeAndPathFromInternalId(internalId).nodeType,
        internalId,
      }));

    const addedResources =
      await MicrosoftRootResource.batchMakeNew(newResourcesBlobs);

    const nodesToSync = await getRootNodesToSyncFromResources(
      this.connectorId,
      addedResources
    );

    // poupulates deltas for the nodes so that if incremental sync starts before
    // fullsync populated, there's no error
    await populateDeltas(this.connectorId, nodesToSync);

    const res = await launchMicrosoftFullSyncWorkflow(
      this.connectorId,
      nodesToSync,
      nodeIdsToDelete
    );

    if (res.isErr()) {
      return res;
    }

    const gcRes = await launchMicrosoftGarbageCollectionWorkflow(
      this.connectorId
    );

    if (gcRes.isErr()) {
      return gcRes;
    }

    const incrementalRes = await launchMicrosoftIncrementalSyncWorkflow(
      this.connectorId
    );
    if (incrementalRes.isErr()) {
      return incrementalRes;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    await terminateAllWorkflowsForConnectorId(this.connectorId);
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const res = await launchMicrosoftIncrementalSyncWorkflow(this.connectorId);
    if (res.isErr()) {
      return res;
    }

    const gcRes = await launchMicrosoftGarbageCollectionWorkflow(
      this.connectorId
    );

    if (gcRes.isErr()) {
      return gcRes;
    }

    return new Ok(undefined);
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
    const config = await MicrosoftConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!config) {
      return new Err(
        new Error(
          `Microsoft config not found with connectorId ${this.connectorId}`
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
        const workflowRes = await launchMicrosoftFullSyncWorkflow(
          this.connectorId
        );
        if (workflowRes.isErr()) {
          return workflowRes;
        }
        return new Ok(undefined);
      }
      case "csvEnabled": {
        await config.update({
          csvEnabled: configValue === "true",
        });
        const workflowRes = await launchMicrosoftFullSyncWorkflow(
          this.connectorId
        );
        if (workflowRes.isErr()) {
          return workflowRes;
        }
        return new Ok(undefined);
      }

      case "largeFilesEnabled": {
        await config.update({
          largeFilesEnabled: configValue === "true",
        });
        const workflowRes = await launchMicrosoftFullSyncWorkflow(
          this.connectorId
        );
        if (workflowRes.isErr()) {
          return workflowRes;
        }
        return new Ok(undefined);
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
    const config = await MicrosoftConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!config) {
      return new Err(
        new Error(
          `Microsoft config not found with connectorId ${this.connectorId}`
        )
      );
    }
    switch (configKey) {
      case "pdfEnabled": {
        return new Ok(config.pdfEnabled ? "true" : "false");
      }
      case "csvEnabled": {
        return new Ok(config.csvEnabled ? "true" : "false");
      }
      case "largeFilesEnabled": {
        return new Ok(config.largeFilesEnabled ? "true" : "false");
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

    return launchMicrosoftGarbageCollectionWorkflow(this.connectorId);
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}

export async function getClient(connectionId: string) {
  const { access_token: accessToken } =
    await getOAuthConnectionAccessTokenWithThrow({
      logger,
      provider: "microsoft",
      connectionId,
    });

  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

export async function retrieveChildrenNodes(
  microsoftNode: MicrosoftNodeResource,
  expandWorksheet: boolean
): Promise<Result<ContentNode[], Error>> {
  const nodeType: MicrosoftNodeType[] = ["file", "folder", "drive"];
  if (expandWorksheet) {
    nodeType.push("worksheet");
  }
  const childrenNodes = await microsoftNode.fetchChildren(nodeType);
  return new Ok(
    childrenNodes.map((node) =>
      getMicrosoftNodeAsContentNode(node, expandWorksheet)
    )
  );
}
