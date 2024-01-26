import type { ConnectorsAPIError, ModelId } from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

import { notionConfig } from "@connectors/connectors/notion/lib/config";
import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import {
  nango_client,
  nangoDeleteConnection,
} from "@connectors/lib/nango_client";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import type { Result } from "@connectors/lib/result";
import { Err, Ok } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";
import type { ConnectorResource } from "@connectors/types/resources";

import type { ConnectorPermissionRetriever } from "../interface";
import { getParents } from "./lib/parents";

const { getRequiredNangoNotionConnectorId } = notionConfig;

const logger = mainLogger.child({ provider: "notion" });

export async function createNotionConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
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

  try {
    const connector = await sequelize_conn.transaction(async (transaction) => {
      const connector = await Connector.create(
        {
          type: "notion",
          connectionId: nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction }
      );
      await NotionConnectorState.create(
        {
          connectorId: connector.id,
        },
        { transaction }
      );

      return connector;
    });
    await launchNotionSyncWorkflow(connector.id);
    return new Ok(connector.id.toString());
  } catch (e) {
    logger.error({ error: e }, "Error creating notion connector.");
    return new Err(e as Error);
  }
}

export async function updateNotionConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: NangoConnectionId | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err({
      message: "Connector not found",
      type: "connector_not_found",
    });
  }

  if (connectionId) {
    const oldConnectionId = c.connectionId;
    const connectionRes = await nango_client().getConnection(
      getRequiredNangoNotionConnectorId(),
      oldConnectionId,
      false
    );
    const newConnectionRes = await nango_client().getConnection(
      getRequiredNangoNotionConnectorId(),
      connectionId,
      false
    );

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
    nangoDeleteConnection(
      oldConnectionId,
      getRequiredNangoNotionConnectorId()
    ).catch((e) => {
      logger.error(
        { error: e, oldConnectionId },
        "Error deleting old Nango connection"
      );
    });
  }

  return new Ok(c.id.toString());
}

export async function stopNotionConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);

  if (!connector) {
    logger.error(
      {
        connectorId: connectorId,
      },
      "Notion connector not found."
    );

    return new Err(new Error("Connector not found"));
  }

  try {
    await stopNotionSyncWorkflow(connector.id.toString());
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

  return new Ok(connector.id.toString());
}

export async function resumeNotionConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);

  if (!connector) {
    logger.error(
      {
        connectorId: connectorId,
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

  return new Ok(connector.id.toString());
}

export async function fullResyncNotionConnector(
  connectorId: string,
  fromTs: number | null
) {
  const connector = await Connector.findOne({
    where: { type: "notion", id: connectorId },
  });

  if (!connector) {
    logger.error({ connectorId }, "Notion connector not found.");
    return new Err(new Error("Connector not found"));
  }

  try {
    await stopNotionConnector(connector.id.toString());
  } catch (e) {
    logger.error(
      {
        connectorId,
        workspaceId: connector.workspaceId,
        dataSourceName: connector.dataSourceName,
        e,
      },
      "Error stopping notion sync workflow."
    );

    return new Err(e as Error);
  }

  try {
    await launchNotionSyncWorkflow(
      connector.id,
      fromTs,
      true //forceResync
    );
  } catch (e) {
    logger.error(
      {
        connectorId,
        workspaceId: connector.workspaceId,
        dataSourceName: connector.dataSourceName,
        error: e,
      },
      "Error launching notion sync workflow."
    );
  }

  return new Ok(connector.id.toString());
}

export async function cleanupNotionConnector(
  connectorId: string
): Promise<Result<void, Error>> {
  return sequelize_conn.transaction(async (transaction) => {
    const connector = await Connector.findOne({
      where: { type: "notion", id: connectorId },
      transaction: transaction,
    });

    if (!connector) {
      logger.error({ connectorId }, "Notion connector not found.");
      return new Err(new Error("Connector not found"));
    }

    await NotionPage.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction: transaction,
    });
    await NotionConnectorState.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction: transaction,
    });
    await connector.destroy({
      transaction: transaction,
    });

    await deleteNangoConnection(connector.connectionId);

    return new Ok(undefined);
  });
}

async function deleteNangoConnection(connectionId: NangoConnectionId) {
  const nangoRes = await nangoDeleteConnection(
    connectionId,
    getRequiredNangoNotionConnectorId()
  );
  if (nangoRes.isErr()) {
    logger.error(
      { err: nangoRes.error },
      "Error deleting connection from Nango"
    );
  }
}

export async function retrieveNotionConnectorPermissions({
  connectorId,
  parentInternalId,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const parentId = parentInternalId || "workspace";

  const [pages, dbs] = await Promise.all([
    NotionPage.findAll({
      where: {
        connectorId,
        parentId,
      },
    }),
    NotionDatabase.findAll({
      where: {
        connectorId,
        parentId,
      },
    }),
  ]);

  const getPageResources = async (
    page: NotionPage
  ): Promise<ConnectorResource> => {
    const [childPage, childDB] = await Promise.all([
      NotionPage.findOne({
        where: {
          connectorId,
          parentId: page.notionPageId,
        },
      }),
      NotionDatabase.findOne({
        where: {
          connectorId,
          parentId: page.notionPageId,
        },
      }),
    ]);

    const expandable = childPage || childDB ? true : false;

    return {
      provider: c.type,
      internalId: page.notionPageId,
      parentInternalId:
        !page.parentId || page.parentId === "workspace" ? null : page.parentId,
      type: "file",
      title: page.title || "",
      sourceUrl: page.notionUrl || null,
      expandable,
      permission: "read",
      dustDocumentId: `notion-${page.notionPageId}`,
      lastUpdatedAt: page.lastUpsertedTs?.getTime() || null,
    };
  };

  const pageResources = await Promise.all(
    pages.map((p) => getPageResources(p))
  );

  const getDbResources = async (
    db: NotionDatabase
  ): Promise<ConnectorResource> => {
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
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
  };

  const dbResources = await Promise.all(dbs.map((db) => getDbResources(db)));

  const folderResources: ConnectorResource[] = [];
  if (!parentInternalId) {
    const [orphanedPagesCount, orphanedDbsCount] = await Promise.all([
      NotionPage.count({
        where: {
          connectorId,
          parentId: "unknown",
        },
      }),
      NotionDatabase.count({
        where: {
          connectorId,
          parentId: "unknown",
        },
      }),
    ]);

    if (orphanedPagesCount + orphanedDbsCount > 0) {
      // We also need to return a "fake" top-level folder call "Orphaned" to include resources
      // we haven't been able to find a parent for.
      folderResources.push({
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

  const resources = pageResources.concat(dbResources);

  resources.sort((a, b) => {
    return a.title.localeCompare(b.title);
  });

  return new Ok(resources.concat(folderResources));
}

export async function retrieveNotionResourcesTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string | null>, Error>> {
  const pages = await NotionPage.findAll({
    where: {
      connectorId,
      notionPageId: internalIds,
    },
  });

  const dbs = await NotionDatabase.findAll({
    where: {
      connectorId,
      notionDatabaseId: internalIds,
    },
  });

  const titles = pages
    .map((p) => ({ internalId: p.notionPageId, title: p.title }))
    .concat(
      dbs.map((db) => ({ internalId: db.notionDatabaseId, title: db.title }))
    )
    .reduce((acc, { internalId, title }) => {
      acc[internalId] = title ?? null;
      return acc;
    }, {} as Record<string, string | null>);

  return new Ok(titles);
}

export async function retrieveNotionResourceParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const memo = memoizationKey || uuidv4();

  try {
    const parents = await getParents(connectorId, internalId, memo);

    return new Ok(parents);
  } catch (e) {
    logger.error(
      { connectorId, internalId, memoizationKey, error: e },
      "Error retrieving notion resource parents"
    );
    return new Err(e as Error);
  }
}
