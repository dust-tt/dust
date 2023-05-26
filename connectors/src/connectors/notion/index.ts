import { Transaction } from "sequelize";

import { ConnectorCreatorParams } from "@connectors/connectors";
import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  Connector,
  NotionConnectorState,
  NotionPage,
  sequelize_conn,
} from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
import { Err, Ok, Result } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";

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

export async function fullResyncNotionConnector(connectorId: string) {
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
    await launchNotionSyncWorkflow(connector.id.toString(), null);
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
