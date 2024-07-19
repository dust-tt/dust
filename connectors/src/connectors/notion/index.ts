import type {
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { Err, getNotionDatabaseTableId, Ok } from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

import { notionConfig } from "@connectors/connectors/notion/lib/config";
import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import {
  getAccessTokenFromNango,
  getConnectionFromNango,
} from "@connectors/lib/nango_helpers";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";

import { BaseConnectorManager } from "../interface";
import { getParents } from "./lib/parents";

const { getRequiredNangoNotionConnectorId } = notionConfig;

const logger = mainLogger.child({ provider: "notion" });

export class NotionConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: NangoConnectionId;
  }): Promise<Result<string, Error>> {
    const nangoConnectionId = connectionId;

    const notionAccessToken = await getAccessTokenFromNango({
      connectionId: nangoConnectionId,
      integrationId: getRequiredNangoNotionConnectorId(),
      useCache: false,
    });

    const isValidToken = await validateAccessToken(notionAccessToken);
    if (!isValidToken) {
      return new Err(new Error("Notion access token is invalid"));
    }

    let connector: ConnectorResource;
    try {
      connector = await ConnectorResource.makeNew(
        "notion",
        {
          connectionId: nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        {}
      );
    } catch (e) {
      logger.error({ error: e }, "Error creating notion connector.");
      return new Err(e as Error);
    }

    try {
      await launchNotionSyncWorkflow(connector.id);
    } catch (e) {
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
          error: e,
        },
        "Error launching notion sync workflow."
      );
      await connector.delete();
      return new Err(e as Error);
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: NangoConnectionId | null;
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
      const connectionRes = await getConnectionFromNango({
        connectionId: oldConnectionId,
        integrationId: getRequiredNangoNotionConnectorId(),
        refreshToken: true,
      });

      const newConnectionRes = await getConnectionFromNango({
        connectionId,
        integrationId: getRequiredNangoNotionConnectorId(),
        refreshToken: false,
      });

      const workspaceId = connectionRes?.credentials?.raw?.workspace_id || null;
      const newWorkspaceId =
        newConnectionRes?.credentials?.raw?.workspace_id || null;

      if (!workspaceId || !newWorkspaceId) {
        return new Err({
          type: "connector_update_error",
          message: "Error retrieving nango connection info to update connector",
        });
      }
      if (workspaceId !== newWorkspaceId) {
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
            dataSourceName: dataSourceConfig.dataSourceName,
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
          dataSourceName: dataSourceConfig.dataSourceName,
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
          dataSourceName: connector.dataSourceName,
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
          dataSourceName: connector.dataSourceName,
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

    const getPageNodes = async (page: NotionPage): Promise<ContentNode> => {
      const [childPage, childDB] = await Promise.all([
        NotionPage.findOne({
          where: {
            connectorId: this.connectorId,
            parentId: page.notionPageId,
          },
        }),
        NotionDatabase.findOne({
          where: {
            connectorId: this.connectorId,
            parentId: page.notionPageId,
          },
        }),
      ]);

      const expandable = childPage || childDB ? true : false;

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

    let pageNodes = await Promise.all(pages.map((p) => getPageNodes(p)));
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
      const [orphanedPagesCount, orphanedDbsCount] = await Promise.all([
        NotionPage.count({
          where: {
            connectorId: this.connectorId,
            parentId: "unknown",
          },
        }),
        NotionDatabase.count({
          where: {
            connectorId: this.connectorId,
            parentId: "unknown",
          },
        }),
      ]);

      if (orphanedPagesCount + orphanedDbsCount > 0) {
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

    const pageNodes: ContentNode[] = pages.map((page) => ({
      provider: "notion",
      internalId: page.notionPageId,
      parentInternalId:
        !page.parentId || page.parentId === "workspace" ? null : page.parentId,
      type: "file",
      title: page.title || "",
      sourceUrl: page.notionUrl || null,
      expandable: false,
      permission: "read",
      dustDocumentId: `notion-${page.notionPageId}`,
      lastUpdatedAt: page.lastUpsertedTs?.getTime() || null,
      dustTableId: null,
    }));

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
      const parents = await getParents(
        this.connectorId,
        internalId,
        new Set<string>(),
        memo
      );

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
