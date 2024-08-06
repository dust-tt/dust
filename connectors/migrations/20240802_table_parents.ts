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
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import { NotionDatabase } from "@connectors/lib/models/notion";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

async function updateParents({
  dataSourceConfig,
  tableId,
  parents,
  execute,
  logger,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  parents: string[];
  execute: boolean;
  logger: Logger;
}): Promise<void> {
  const table = await getTable({
    dataSourceConfig,
    tableId,
  });
  if (
    table &&
    (table.parents.length !== parents.length ||
      table.parents.some((p) => parents.indexOf(p) === -1))
  ) {
    logger.info(`Update parents for ${tableId}, new value: ${parents}`);
    if (execute) {
      await updateTableParentsField({ tableId, parents, dataSourceConfig });
    }
  }
}

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

    await updateParents({
      dataSourceConfig,
      tableId,
      parents,
      execute,
      logger,
    });
  }

  const csvFiles = await GoogleDriveFiles.findAll({
    where: {
      mimeType: "text/csv",
      connectorId: connector.id,
    },
  });
  for (const file of csvFiles) {
    const { driveFileId, dustFileId, connectorId } = file;

    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const parents = await getGoogleParents(connectorId, driveFileId, memo);
    await updateParents({
      dataSourceConfig,
      tableId: dustFileId,
      parents,
      execute,
      logger,
    });
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
      [Op.or]: [
        {
          nodeType: "worksheet",
          connectorId: connector.id,
        },
        {
          nodeType: "file",
          mimeType: ["application/vnd.ms-excel", "text/csv"],
          connectorId: connector.id,
        },
      ],
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

    await updateParents({
      dataSourceConfig,
      tableId: internalId,
      parents,
      execute,
      logger,
    });
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

    await updateParents({
      dataSourceConfig,
      tableId: "notion-" + notionDatabaseId,
      parents,
      execute,
      logger,
    });
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
