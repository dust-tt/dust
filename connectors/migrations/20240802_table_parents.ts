import { CoreAPI, getGoogleSheetTableId } from "@dust-tt/types";
import { table } from "console";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { getLocalParents as getGoogleParents } from "@connectors/connectors/google_drive/lib";
import { getParents as getMicrosoftParents } from "@connectors/connectors/microsoft/temporal/file";
import { getParents as getNotionParents } from "@connectors/connectors/notion/lib/parents";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { updateTableParentsField } from "@connectors/lib/data_sources";
import { GoogleDriveSheet } from "@connectors/lib/models/google_drive";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import { NotionDatabase } from "@connectors/lib/models/notion";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

// Deleting all existing Google Drive CSV files
export async function googleTables(
  execute: boolean,
  logger: Logger
): Promise<void> {
  const memo = uuidv4();
  const csvGoogleSheets = await GoogleDriveSheet.findAll({});
  for (const sheet of csvGoogleSheets) {
    const { driveFileId, driveSheetId, connectorId } = sheet;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(
        `Could not find connector for connectorId ${connectorId}`
      );
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const tableId = getGoogleSheetTableId(driveFileId, driveSheetId);

    const [, ...parents] = await getGoogleParents(connectorId, tableId, memo);

    await updateTableParentsField({ tableId, parents, dataSourceConfig });
  }
}

export async function microsoftTables(
  execute: boolean,
  logger: Logger
): Promise<void> {
  const microsoftSheets = await MicrosoftNodeModel.findAll({
    where: {
      nodeType: "worksheet",
    },
  });
  for (const sheet of microsoftSheets) {
    const { internalId, parentInternalId, connectorId } = sheet;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(
        `Could not find connector for connectorId ${connectorId}`
      );
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const [, ...parents] = await getMicrosoftParents({
      connectorId,
      internalId,
      parentInternalId,
      startSyncTs: 0,
    });

    await updateTableParentsField({
      tableId: internalId,
      parents,
      dataSourceConfig,
    });
  }
}

export async function notionTables(
  execute: boolean,
  logger: Logger
): Promise<void> {
  const notionDatabases = await NotionDatabase.findAll({
    where: {
      structuredDataUpsertedTs: {
        [Op.not]: null,
      },
    },
  });

  const memo = uuidv4();

  for (const database of notionDatabases) {
    const { notionDatabaseId, parentId, connectorId } = database;
    if (!connectorId) {
      continue;
    }

    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(
        `Could not find connector for connectorId ${connectorId}`
      );
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const [, ...parents] = await getNotionParents(
      connectorId as number,
      parentId as string,
      new Set<string>(),
      memo
    );

    await updateTableParentsField({
      tableId: "notion-" + notionDatabaseId,
      parents,
      dataSourceConfig,
    });
  }
}

makeScript({}, async ({ execute }, logger) => {
  await googleTables(execute, logger);
  await microsoftTables(execute, logger);
  await notionTables(execute, logger);
});
