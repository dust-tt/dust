import { validateAccessToken } from "@connectors/connectors/notion/lib/notion_api";
import {
  launchNotionSyncWorkflow,
  stopNotionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

const { NANGO_NOTION_CONNECTOR_ID } = process.env;

export async function createNotionConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string
): Promise<Result<string, Error>> {
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

  try {
    const connector = await Connector.create({
      type: "notion",
      nangoConnectionId,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    });
    await launchNotionSyncWorkflow(dataSourceConfig, nangoConnectionId);
    return new Ok(connector.id.toString());
  } catch (e) {
    logger.error("Error creating notion connector", e);
    return new Err(e as Error);
  }
}

export async function stopNotionConnector(
  dataSourceInfo: DataSourceInfo
): Promise<Result<string, Error>> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceInfo.workspaceId,
      dataSourceName: dataSourceInfo.dataSourceName,
    },
  });

  if (!connector) {
    logger.error(
      {
        workspaceId: dataSourceInfo.workspaceId,
        dataSourceName: dataSourceInfo.dataSourceName,
      },
      "Notion connector not found"
    );

    return new Err(new Error("Connector not found"));
  }

  try {
    await stopNotionSyncWorkflow(dataSourceInfo);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceInfo.workspaceId,
        dataSourceName: dataSourceInfo.dataSourceName,
        e,
      },
      "Error stopping notion sync workflow"
    );

    return new Err(e as Error);
  }

  return new Ok(connector.id.toString());
}

export async function resumeNotionConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
  });

  if (!connector) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      "Notion connector not found"
    );
    return new Err(new Error("Connector not found"));
  }

  try {
    await launchNotionSyncWorkflow(
      dataSourceConfig,
      nangoConnectionId,
      connector?.lastSyncSuccessfulTime?.getTime()
    );
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
        e,
      },
      "Error launching notion sync workflow"
    );
  }

  return new Ok(connector.id.toString());
}
