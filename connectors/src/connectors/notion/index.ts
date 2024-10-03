import type {
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import {
  Err,
  getNotionDatabaseTableId,
  getOAuthConnectionAccessToken,
  Ok,
} from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

import type { ConnectorManagerError } from "../interface";
import { BaseConnectorManager } from "../interface";
import { getOrphanedCount, getParents, hasChildren } from "./lib/parents";

const logger = mainLogger.child({ provider: "notion" });

async function workspaceIdFromConnectionId(connectionId: string) {
  const tokRes = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "notion",
    connectionId,
  });
  if (tokRes.isErr()) {
    return tokRes;
  }
  return new Ok(
    (tokRes.value.scrubbed_raw_json as { workspace_id?: string })
      .workspace_id ?? null
  );
}

export class NotionConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError>> {
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

    const connector = await ConnectorResource.makeNew(
      "notion",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {}
    );

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
  }): Promise<Result<string, ConnectorsAPIError>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err({
        message: "Connector not found",
        type: "connector_not_found",
      });
    }

    if (connectionId) {
      const oldConnectionId = c.connectionId;
      const [workspaceIdRes, newWorkspaceIdRes] = await Promise.all([
        workspaceIdFromConnectionId(oldConnectionId),
        workspaceIdFromConnectionId(connectionId),
      ]);

      if (workspaceIdRes.isErr() || newWorkspaceIdRes.isErr()) {
        if (workspaceIdRes.isErr()) {
          logger.error(
            {
              oldConnectionId,
              connectionId,
              connectorId: c.id,
              error: workspaceIdRes.error,
            },
            "Error retrieving workspace Id from old connection"
          );
        }
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
        }
        return new Err({
          type: "connector_update_error",
          message:
            "Error retrieving workspace Ids from connections while checking update validity",
        });
      }

      if (!workspaceIdRes.value || !newWorkspaceIdRes.value) {
        return new Err({
          type: "connector_update_error",
          message: "Error retrieving connection info to update connector",
        });
      }
      if (workspaceIdRes.value !== newWorkspaceIdRes.value) {
        return new Err({
          type: "connector_oauth_target_mismatch",
          message: "Cannot change workspace of a Notion connector",
        });
      }

      await c.update({ connectionId });

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
        return new Err({
          type: "connector_update_error",
          message: "Error restarting sync workflow after updating connector",
        });
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
  }): Promise<Result<ContentNode[], Error>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    const parentId = parentInternalId || "workspace";

    const [pages, dbs] = await Promise.all([
      NotionPage.findAll({
        where: {
          connectorId: this.connectorId,
          parentId,
        },
      }),
      NotionDatabase.findAll({
        where: {
          connectorId: this.connectorId,
          parentId,
        },
      }),
    ]);

    const hasChildrenByPageId = await hasChildren(pages, this.connectorId);
    const getPageNode = async (page: NotionPage): Promise<ContentNode> => {
      const expandable = Boolean(hasChildrenByPageId[page.notionPageId]);

      return {
        provider: c.type,
        internalId: page.notionPageId,
        parentInternalId:
          !page.parentId || page.parentId === "workspace"
            ? null
            : page.parentId,
        type: "file",
        title: page.title || "",
        sourceUrl: page.notionUrl || null,
        expandable,
        permission: "read",
        dustDocumentId: `notion-${page.notionPageId}`,
        lastUpdatedAt: page.lastUpsertedTs?.getTime() || null,
      };
    };

    let pageNodes = await Promise.all(pages.map((p) => getPageNode(p)));
    // In structured data mode, we remove leaf node pages
    if (viewType === "tables") {
      pageNodes = pageNodes.filter((p) => p.expandable);
    }

    const getDbNodes = async (db: NotionDatabase): Promise<ContentNode> => {
      return {
        provider: c.type,
        internalId: db.notionDatabaseId,
        parentInternalId:
          !db.parentId || db.parentId === "workspace" ? null : db.parentId,
        type: "database",
        title: db.title || "",
        sourceUrl: db.notionUrl || null,
        expandable: true,
        permission: "read",
        dustDocumentId: `notion-database-${db.notionDatabaseId}`,
        lastUpdatedAt: db.structuredDataUpsertedTs?.getTime() ?? null,
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
          provider: c.type,
          // Orphaned resources in the database will have "unknown" as their parentId.
          internalId: "unknown",
          parentInternalId: null,
          type: "folder",
          title: "Orphaned Resources",
          sourceUrl: null,
          expandable: true,
          permission: "read",
          dustDocumentId: null,
          lastUpdatedAt: null,
        });
      }
    }

    const nodes = pageNodes.concat(dbNodes);

    nodes.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });

    return new Ok(nodes.concat(folderNodes));
  }

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
  }): Promise<Result<ContentNode[], Error>> {
    const [pages, dbs] = await Promise.all([
      NotionPage.findAll({
        where: {
          connectorId: this.connectorId,
          notionPageId: internalIds,
        },
      }),
      NotionDatabase.findAll({
        where: {
          connectorId: this.connectorId,
          notionDatabaseId: internalIds,
        },
      }),
    ]);

    const hasChildrenByPageId = await hasChildren(pages, this.connectorId);
    const pageNodes: ContentNode[] = await Promise.all(
      pages.map(async (page) => ({
        provider: "notion",
        internalId: page.notionPageId,
        parentInternalId:
          !page.parentId || page.parentId === "workspace"
            ? null
            : page.parentId,
        type: "file",
        title: page.title || "",
        sourceUrl: page.notionUrl || null,
        expandable: Boolean(hasChildrenByPageId[page.notionPageId]),
        permission: "read",
        dustDocumentId: `notion-${page.notionPageId}`,
        lastUpdatedAt: page.lastUpsertedTs?.getTime() || null,
        dustTableId: null,
      }))
    );

    const dbNodes: ContentNode[] = dbs.map((db) => ({
      provider: "notion",
      internalId: db.notionDatabaseId,
      parentInternalId:
        !db.parentId || db.parentId === "workspace" ? null : db.parentId,
      type: "database",
      title: db.title || "",
      sourceUrl: db.notionUrl || null,
      expandable: true,
      permission: "read",
      dustDocumentId: null,
      lastUpdatedAt: null,
      dustTableId: getNotionDatabaseTableId(db.notionDatabaseId),
    }));

    const contentNodes = pageNodes.concat(dbNodes);

    if (internalIds.indexOf("unknown") !== -1) {
      const orphanedCount = await getOrphanedCount(this.connectorId);
      if (orphanedCount > 0) {
        contentNodes.push({
          provider: "notion",
          // Orphaned resources in the database will have "unknown" as their parentId.
          internalId: "unknown",
          parentInternalId: null,
          type: "folder",
          title: "Orphaned Resources",
          sourceUrl: null,
          expandable: true,
          permission: "read",
          dustDocumentId: null,
          lastUpdatedAt: null,
        });
      }
    }
    return new Ok(contentNodes);
  }

  async retrieveContentNodeParents({
    internalId,
    memoizationKey,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    const memo = memoizationKey || uuidv4();

    try {
      const parents = await getParents(this.connectorId, internalId, [], memo);

      return new Ok(parents);
    } catch (e) {
      logger.error(
        { connectorId: this.connectorId, internalId, memoizationKey, error: e },
        "Error retrieving notion resource parents"
      );
      return new Err(e as Error);
    }
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
