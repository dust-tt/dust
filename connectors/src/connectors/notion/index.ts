import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import _ from "lodash";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import { validateNotionOAuthResponse } from "@connectors/connectors/notion/lib/utils";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import {
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ContentNode, ContentNodesViewType } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import {
  getOAuthConnectionAccessToken,
  INTERNAL_MIME_TYPES,
} from "@connectors/types";

import { getOrphanedCount, hasChildren } from "./lib/parents";

const logger = mainLogger.child({ provider: "notion" });

export function nodeIdFromNotionId(notionId: string) {
  return `notion-${notionId}`;
}

function notionIdFromNodeId(nodeId: string) {
  return _.last(nodeId.split("notion-"))!;
}

export async function workspaceIdFromConnectionId(connectionId: string) {
  const tokRes = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "notion",
    connectionId,
  });
  if (tokRes.isErr()) {
    return tokRes;
  }

  const validationRes = validateNotionOAuthResponse(
    tokRes.value.scrubbed_raw_json,
    logger
  );
  if (validationRes.isErr()) {
    logger.error(
      {
        errors: validationRes.error,
        rawJson: tokRes.value.scrubbed_raw_json,
      },
      "Invalid Notion OAuth response"
    );

    return new Err(new Error("Invalid Notion OAuth response"));
  }

  return new Ok(validationRes.value.workspace_id);
}

export class NotionConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const tokRes = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      provider: "notion",
      connectionId,
    });
    if (tokRes.isErr()) {
      throw new Error("Error retrieving access token: " + tokRes.error.message);
    }

    const isValidToken = await validateAccessToken(tokRes.value.access_token);
    if (!isValidToken) {
      throw new Error("Notion access token is invalid");
    }

    // Validate the response with our utility function
    const rawJson = validateNotionOAuthResponse(
      tokRes.value.scrubbed_raw_json,
      logger
    );
    if (rawJson.isErr()) {
      throw new Error("Invalid Notion OAuth response");
    }

    const connector = await ConnectorResource.makeNew(
      "notion",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {
        notionWorkspaceId: rawJson.value.workspace_id,
      }
    );

    // For each connector, there are 2 special folders (root folders):
    // - Syncing: contains all the pages visited during the sync process whose ancestry could not be resolved (one of the ancestors not synced yet).
    // - Orphaned Resources: contains all the pages whose ancestors are not all synced/given access to.
    await upsertDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: nodeIdFromNotionId("unknown"),
      parents: [nodeIdFromNotionId("unknown")],
      parentId: null,
      title: "Orphaned Resources",
      mimeType: INTERNAL_MIME_TYPES.NOTION.UNKNOWN_FOLDER,
    });
    // Upsert to data_sources_folders (core) a top-level folder for the syncing resources.
    await upsertDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: nodeIdFromNotionId("syncing"),
      parents: [nodeIdFromNotionId("syncing")],
      parentId: null,
      title: "Syncing",
      mimeType: INTERNAL_MIME_TYPES.NOTION.SYNCING_FOLDER,
    });

    try {
      await launchNotionSyncWorkflow(connector.id);
    } catch (e) {
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          error: e,
        },
        "Error launching notion sync workflow."
      );
      await connector.delete();
      throw e;
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    if (connectionId) {
      const oldConnectionId = c.connectionId;
      const newWorkspaceIdRes = await workspaceIdFromConnectionId(connectionId);

      if (newWorkspaceIdRes.isErr()) {
        logger.error(
          {
            oldConnectionId,
            connectionId,
            connectorId: c.id,
            error: newWorkspaceIdRes.error,
          },
          "Error retrieving workspace Id from new connection"
        );
        throw new Error("Error retrieving workspace Id from new connection");
      }

      if (!newWorkspaceIdRes.value) {
        throw new Error("Error retrieving connection info to update connector");
      }

      const connectorState = await NotionConnectorState.findOne({
        where: {
          connectorId: c.id,
        },
      });

      if (!connectorState) {
        throw new Error("Notion connector state not found");
      }

      if (connectorState.notionWorkspaceId !== newWorkspaceIdRes.value) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change workspace of a Notion connector"
          )
        );
      }

      await c.update({ connectionId });

      // If connector was previously paused, unpause it.
      if (c.isPaused()) {
        await this.unpause();
      }

      const dataSourceConfig = dataSourceConfigFromConnector(c);
      try {
        await launchNotionSyncWorkflow(c.id);
      } catch (e) {
        logger.error(
          {
            workspaceId: dataSourceConfig.workspaceId,
            dataSourceId: dataSourceConfig.dataSourceId,
            error: e,
          },
          "Error launching notion sync workflow post update."
        );
        throw new Error(
          "Error restarting sync workflow after updating connector"
        );
      }
    }

    return new Ok(c.id.toString());
  }

  async stop(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);

    if (!connector) {
      logger.error(
        {
          connectorId: this.connectorId,
        },
        "Notion connector not found."
      );

      return new Err(new Error("Connector not found"));
    }

    try {
      await stopNotionSyncWorkflow(connector.id);
    } catch (e) {
      logger.error(
        {
          connectorId: connector.id,
          error: e,
        },
        "Error stopping notion sync workflow"
      );

      return new Err(e as Error);
    }

    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);

    if (!connector) {
      logger.error(
        {
          connectorId: this.connectorId,
        },
        "Notion connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    try {
      await launchNotionSyncWorkflow(
        connector.id,
        connector.lastSyncSuccessfulTime
          ? connector.lastSyncStartTime?.getTime()
          : null
      );
    } catch (e) {
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          error: e,
        },
        "Error launching notion sync workflow."
      );
    }

    return new Ok(undefined);
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Notion connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Notion connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);

    if (!connector) {
      logger.error(
        {
          connectorId: this.connectorId,
        },
        "Notion connector not found."
      );

      return new Err(new Error("Connector not found"));
    }

    await connector.markAsPaused();
    const stopRes = await this.stop();
    if (stopRes.isErr()) {
      return stopRes;
    }

    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);

    if (!connector) {
      logger.error(
        {
          connectorId: this.connectorId,
        },
        "Notion connector not found."
      );

      return new Err(new Error("Connector not found"));
    }

    await connector.markAsUnpaused();
    const r = await this.resume();
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Notion connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const notionConnectorState = await NotionConnectorState.findOne({
      where: {
        connectorId: this.connectorId,
      },
    });

    if (!notionConnectorState) {
      logger.error(
        { connectorId: this.connectorId },
        "Notion connector state not found."
      );
      return new Err(new Error("Connector state not found"));
    }

    try {
      await this.stop();
    } catch (e) {
      logger.error(
        {
          connectorId: this.connectorId,
          workspaceId: connector.workspaceId,
          dataSourceId: connector.dataSourceId,
          e,
        },
        "Error stopping notion sync workflow."
      );

      return new Err(e as Error);
    }

    notionConnectorState.fullResyncStartTime = new Date();
    await notionConnectorState.save();

    try {
      await launchNotionSyncWorkflow(
        connector.id,
        fromTs,
        true //forceResync
      );
    } catch (e) {
      logger.error(
        {
          connectorId: this.connectorId,
          workspaceId: connector.workspaceId,
          dataSourceId: connector.dataSourceId,
          error: e,
        },
        "Error launching notion sync workflow."
      );
    }

    return new Ok(connector.id.toString());
  }

  async retrievePermissions({
    parentInternalId,
    viewType,
  }: {
    parentInternalId: string | null;
    viewType: ContentNodesViewType;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const notionId =
      (parentInternalId && notionIdFromNodeId(parentInternalId)) || "workspace";

    const [pages, dbs] = await Promise.all([
      NotionPage.findAll({
        where: {
          connectorId: this.connectorId,
          parentId: notionId,
        },
      }),
      NotionDatabase.findAll({
        where: {
          connectorId: this.connectorId,
          parentId: notionId,
        },
      }),
    ]);

    const hasChildrenByPageId = await hasChildren(pages, this.connectorId);
    const getPageNode = async (page: NotionPage): Promise<ContentNode> => {
      const expandable = Boolean(hasChildrenByPageId[page.notionPageId]);

      return {
        internalId: nodeIdFromNotionId(page.notionPageId),
        parentInternalId:
          !page.parentId || page.parentId === "workspace"
            ? null
            : nodeIdFromNotionId(page.parentId),
        type: "document",
        title: page.title || "",
        sourceUrl: page.notionUrl || null,
        expandable,
        permission: "read",
        lastUpdatedAt: page.lastUpsertedTs?.getTime() || null,
        mimeType: INTERNAL_MIME_TYPES.NOTION.PAGE,
      };
    };

    let pageNodes = await Promise.all(pages.map((p) => getPageNode(p)));
    // In structured data mode, we remove leaf node pages
    if (viewType === "table") {
      pageNodes = pageNodes.filter((p) => p.expandable);
    }

    const getDbNodes = async (db: NotionDatabase): Promise<ContentNode> => {
      return {
        internalId: nodeIdFromNotionId(db.notionDatabaseId),
        parentInternalId:
          !db.parentId || db.parentId === "workspace"
            ? null
            : nodeIdFromNotionId(db.parentId),
        type: "table",
        title: db.title || "",
        sourceUrl: db.notionUrl || null,
        expandable: true,
        permission: "read",
        lastUpdatedAt: db.structuredDataUpsertedTs?.getTime() ?? null,
        mimeType: INTERNAL_MIME_TYPES.NOTION.DATABASE,
      };
    };

    const dbNodes = await Promise.all(dbs.map((db) => getDbNodes(db)));

    const folderNodes: ContentNode[] = [];
    if (!parentInternalId) {
      const orphanedCount = await getOrphanedCount(this.connectorId);
      if (orphanedCount > 0) {
        // We also need to return a "fake" top-level folder call "Orphaned" to include resources
        // we haven't been able to find a parent for.
        folderNodes.push({
          // Orphaned resources in the database will have "unknown" as their parentId.
          internalId: nodeIdFromNotionId("unknown"),
          parentInternalId: null,
          type: "folder",
          title: "Orphaned Resources",
          sourceUrl: null,
          expandable: true,
          permission: "read",
          lastUpdatedAt: null,
          mimeType: INTERNAL_MIME_TYPES.NOTION.UNKNOWN_FOLDER,
        });
      }
    }

    const nodes = pageNodes.concat(dbNodes);

    nodes.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });

    return new Ok(nodes.concat(folderNodes));
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    return new Err(
      new Error(`Setting Notion connector permissions is not implemented yet.`)
    );
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not implemented.");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
