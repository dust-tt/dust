import { getGoogleSheetTableId } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { getLocalParents as getGoogleParents } from "@connectors/connectors/google_drive/lib";
import { getParents as getMicrosoftParents } from "@connectors/connectors/microsoft/temporal/file";
import { getParents as getNotionParents } from "@connectors/connectors/notion/lib/parents";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  getTable,
  updateTableParentsField,
} from "@connectors/lib/data_sources";
import { GoogleDriveSheet } from "@connectors/lib/models/google_drive";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import { NotionDatabase } from "@connectors/lib/models/notion";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function googleTables(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
): Promise<void> {
  logger.info(`Processing Google Drive connector ${connector.id}`);
  const memo = uuidv4();
  const csvGoogleSheets = await GoogleDriveSheet.findAll({
    where: { connectorId: connector.id },
  });
  for (const sheet of csvGoogleSheets) {
    const { driveFileId, driveSheetId, connectorId } = sheet;

    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const tableId = getGoogleSheetTableId(driveFileId, driveSheetId);

    const parents = await getGoogleParents(connectorId, tableId, memo);

    const table = await getTable({
      dataSourceConfig,
      tableId,
    });
    if (table && JSON.stringify(table.parents) !== JSON.stringify(parents)) {
      logger.info(`Parents for ${tableId}: ${parents}`);
      if (execute) {
        await updateTableParentsField({ tableId, parents, dataSourceConfig });
      }
    }
  }
}

export async function microsoftTables(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
): Promise<void> {
  logger.info(`Processing Microsoft connector ${connector.id}`);
  const microsoftSheets = await MicrosoftNodeModel.findAll({
    where: {
      nodeType: "worksheet",
      connectorId: connector.id,
    },
  });
  for (const sheet of microsoftSheets) {
    const { internalId, connectorId } = sheet;

    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const parents = await getMicrosoftParents({
      connectorId,
      internalId,
      startSyncTs: 0,
    });

    const table = await getTable({
      dataSourceConfig,
      tableId: internalId,
    });

    if (table && JSON.stringify(table.parents) !== JSON.stringify(parents)) {
      logger.info(`Parents for ${internalId}: ${parents}`);
      if (execute) {
        await updateTableParentsField({
          tableId: internalId,
          parents,
          dataSourceConfig,
        });
      }
    }
  }
}

export async function notionTables(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
): Promise<void> {
  logger.info(`Processing Notion connector ${connector.id}`);
  const notionDatabases = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
      structuredDataUpsertedTs: {
        [Op.not]: null,
      },
    },
  });

  const memo = uuidv4();

  for (const database of notionDatabases) {
    const { notionDatabaseId, connectorId } = database;
    if (!connectorId) {
      continue;
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const parents = await getNotionParents(
      connectorId as number,
      notionDatabaseId as string,
      new Set<string>(),
      memo
    );
    const table = await getTable({
      dataSourceConfig,
      tableId: "notion-" + notionDatabaseId,
    });
    if (table && JSON.stringify(table.parents) !== JSON.stringify(parents)) {
      logger.info(`Parents for notion-${notionDatabaseId}: ${parents}`);
      if (execute) {
        await updateTableParentsField({
          tableId: "notion-" + notionDatabaseId,
          parents,
          dataSourceConfig,
        });
      }
    }
  }
}

export async function handleConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
): Promise<void> {
  switch (connector.type) {
    case "google_drive":
      return googleTables(connector, execute, logger);
    case "microsoft":
      return microsoftTables(connector, execute, logger);
    case "notion":
      return notionTables(connector, execute, logger);
  }
}

makeScript(
  {
    connectorId: { type: "number", demandOption: false },
  },
  async ({ connectorId, execute }, logger) => {
    if (connectorId) {
      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error(
          `Could not find connector for connectorId ${connectorId}`
        );
      }
      await handleConnector(connector, execute, logger);
    } else {
      for (const connectorType of [
        "google_drive",
        "microsoft",
        "notion",
      ] as const) {
        const connectors = await ConnectorResource.listByType(
          connectorType,
          {}
        );
        for (const connector of connectors) {
          await handleConnector(connector, execute, logger);
        }
      }
    }
  }
);
