import { Transaction } from "sequelize";

import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  Connector,
  ModelId,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
  sequelize_conn,
} from "@connectors/lib/models";
import {
  nango_client,
  nangoDeleteConnection,
} from "@connectors/lib/nango_client";
import { Err, Ok, Result } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";
import {
  ConnectorPermission,
  ConnectorResource,
} from "@connectors/types/resources";

import { ConnectorPermissionRetriever } from "../interface";

const { NANGO_NOTION_CONNECTOR_ID } = process.env;
const logger = mainLogger.child({ provider: "notion" });

export async function createNotionConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const nangoConnectionId = connectionId;

  if (!NANGO_NOTION_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const notionAccessToken = (await nango_client().getToken(
    NANGO_NOTION_CONNECTOR_ID,
    nangoConnectionId
  )) as string;

  if (!validateAccessToken(notionAccessToken)) {
    return new Err(new Error("Notion access token is invalid"));
  }

  const transaction = await sequelize_conn.transaction();
  try {
    const connector = await Connector.create(
      {
        type: "notion",
        connectionId: nangoConnectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
        defaultNewResourcePermission: "read_write",
      },
      { transaction }
    );
    await NotionConnectorState.create(
      {
        connectorId: connector.id,
      },
      { transaction }
    );
    await transaction.commit();
    await launchNotionSyncWorkflow(connector.id.toString());
    return new Ok(connector.id.toString());
  } catch (e) {
    logger.error({ error: e }, "Error creating notion connector.");
    await transaction.rollback();
    return new Err(e as Error);
  }
}

export async function updateNotionConnector(
  connectorId: ModelId,
  {
    connectionId,
    newDefaultNewResourcePermission,
  }: {
    connectionId?: NangoConnectionId | null;
    newDefaultNewResourcePermission?: ConnectorPermission | null;
  }
): Promise<Result<string, ConnectorsAPIErrorResponse>> {
  if (!NANGO_NOTION_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  if (newDefaultNewResourcePermission) {
    logger.error(
      { connectorId, newDefaultNewResourcePermission },
      "Cannot change defaultNewResourcePermission of a Notion connector"
    );

    return new Err({
      error: {
        type: "connector_update_unauthorized",
        message:
          "Cannot change defaultNewResourcePermission of a Notion connector",
      },
    });
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

  if (connectionId) {
    const oldConnectionId = c.connectionId;
    const connectionRes = await nango_client().getConnection(
      NANGO_NOTION_CONNECTOR_ID,
      oldConnectionId,
      false,
      false
    );
    const newConnectionRes = await nango_client().getConnection(
      NANGO_NOTION_CONNECTOR_ID,
      connectionId,
      false,
      false
    );

    const workspaceId = connectionRes?.credentials?.raw?.workspace_id || null;
    const newWorkspaceId =
      newConnectionRes?.credentials?.raw?.workspace_id || null;

    if (!workspaceId || !newWorkspaceId) {
      return new Err({
        error: {
          type: "connector_update_error",
          message: "Error retrieving nango connection info to update connector",
        },
      });
    }
    if (workspaceId !== newWorkspaceId) {
      return new Err({
        error: {
          type: "connector_oauth_target_mismatch",
          message: "Cannot change workspace of a Notion connector",
        },
      });
    }

    await c.update({ connectionId });
    nangoDeleteConnection(oldConnectionId, NANGO_NOTION_CONNECTOR_ID).catch(
      (e) => {
        logger.error(
          { error: e, oldConnectionId },
          "Error deleting old Nango connection"
        );
      }
    );
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
      connector.id.toString(),
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
      connector.id.toString(),
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
  connectorId: string,
  transaction: Transaction
): Promise<Result<void, Error>> {
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

  return new Ok(undefined);
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

  const [pages, dbs] = await Promise.all([
    NotionPage.findAll({
      where: {
        connectorId,
        parentId: parentInternalId || "workspace",
      },
    }),
    NotionDatabase.findAll({
      where: {
        connectorId,
        parentId: parentInternalId || "workspace",
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
    };
  };

  const dbResources = await Promise.all(dbs.map((db) => getDbResources(db)));

  return new Ok(pageResources.concat(dbResources));
}
