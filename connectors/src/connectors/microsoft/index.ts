import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import { Client } from "@microsoft/microsoft-graph-client";

import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import {
  getChannelAsContentNode,
  getDriveAsContentNode,
  getFolderAsContentNode,
  getMicrosoftNodeAsContentNode,
  getSiteAsContentNode,
  getTeamAsContentNode,
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
import { getParents } from "@connectors/connectors/microsoft/temporal/file";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import { syncSucceeded } from "@connectors/lib/sync_status";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  MicrosoftConfigurationResource,
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export class MicrosoftConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError>> {
    const client = await getClient(connectionId);

    try {
      // Sanity checks - check connectivity and permissions. User should be able to access the sites and teams list.
      await getSites(client);
      await getTeams(client);
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
  }): Promise<Result<string, ConnectorsAPIError>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err({
        message: "Connector not found",
        type: "connector_not_found",
      });
    }

    // Check that we don't switch tenants
    if (connectionId) {
      try {
        const client = await getClient(connector.connectionId);
        const currentOrg = await clientApiGet(client, "/organization");

        const newClient = await getClient(connectionId);
        const newOrg = await clientApiGet(newClient, "/organization");

        if (
          !currentOrg?.value ||
          !newOrg?.value ||
          currentOrg.value.length === 0 ||
          newOrg.value.length === 0
        ) {
          return new Err({
            type: "connector_update_error",
            message: "Error retrieving organization info to update connector",
          });
        }
        if (currentOrg.value[0].id !== newOrg.value[0].id) {
          return new Err({
            type: "connector_oauth_target_mismatch",
            message: "Cannot change domain of a Microsoft connector",
          });
        }
      } catch (e) {
        logger.error(
          {
            error: e,
          },
          `Error checking Microsoft organization - lets update the connector regardless`
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
  }): Promise<Result<ContentNode[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const isTablesView = viewType === "tables";
    if (filterPermission === "read" || isTablesView) {
      if (!parentInternalId) {
        const nodes = await MicrosoftNodeResource.fetchNodesWithoutParents(
          this.connectorId
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
          new Error(`Could not find node with id ${parentInternalId}`)
        );
      }
      return retrieveChildrenNodes(node, isTablesView);
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
        nodeType: "sites-root",
        itemAPIPath: "",
      });
    }

    const { nodeType } = typeAndPathFromInternalId(parentInternalId);

    switch (nodeType) {
      case "sites-root": {
        const sites = await getAllPaginatedEntities((nextLink) =>
          getSites(client, nextLink)
        );
        nodes.push(...sites.map((n) => getSiteAsContentNode(n)));
        break;
      }
      case "teams-root": {
        const teams = await getAllPaginatedEntities((nextLink) =>
          getTeams(client, nextLink)
        );
        nodes.push(...teams.map((n) => getTeamAsContentNode(n)));
        break;
      }
      case "team": {
        const channels = await getAllPaginatedEntities((nextLink) =>
          getChannels(client, parentInternalId, nextLink)
        );
        nodes.push(
          ...channels.map((n) => getChannelAsContentNode(n, parentInternalId))
        );
        break;
      }
      case "site": {
        const subSites = await getAllPaginatedEntities((nextLink) =>
          getSubSites(client, parentInternalId, nextLink)
        );
        const drives = await getAllPaginatedEntities((nextLink) =>
          getDrives(client, parentInternalId, nextLink)
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
          getFilesAndFolders(client, parentInternalId, nextLink)
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
        resourceIds: Object.keys(permissions),
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

  async retrieveBatchContentNodes({
    internalIds,
    viewType,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    try {
      const nodes = await MicrosoftNodeResource.fetchByInternalIds(
        this.connectorId,
        internalIds
      );

      const contentNodes = nodes.map((node) =>
        getMicrosoftNodeAsContentNode(node, viewType === "tables")
      );

      const selectedResources = (
        await MicrosoftRootResource.listRootsByConnectorId(connector.id)
      ).map((r) => r.internalId);

      const contentNodesWithPermissions = contentNodes.map((node) => ({
        ...node,
        permission: (selectedResources.includes(node.internalId) ||
        (node.parentInternalId &&
          selectedResources.includes(node.parentInternalId))
          ? "read"
          : "none") as ConnectorPermission,
      }));

      return new Ok(contentNodesWithPermissions);
    } catch (error) {
      return new Err(new Error("Failed to retrieve Microsoft content nodes"));
    }
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const parents = await getParents({
      connectorId: this.connectorId,
      internalId,
      // base memoization, caches the parents for 30mn
      startSyncTs: 0,
    });
    return new Ok(parents);
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
    const r = await launchMicrosoftFullSyncWorkflow(this.connectorId);
    if (r.isErr()) {
      return r;
    }

    const gcRes = await launchMicrosoftGarbageCollectionWorkflow(
      this.connectorId
    );

    if (gcRes.isErr()) {
      return gcRes;
    }

    const incrementalSync = await launchMicrosoftIncrementalSyncWorkflow(
      this.connectorId
    );
    if (incrementalSync.isErr()) {
      return incrementalSync;
    }
    return new Ok(undefined);
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
