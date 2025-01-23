import {
  concurrentExecutor,
  getGoogleSheetTableId,
  MIME_TYPES,
} from "@dust-tt/types";
import _ from "lodash";
import type { LoggerOptions } from "pino";
import type pino from "pino";
import { makeScript } from "scripts/helpers";

import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getLocalParents } from "@connectors/connectors/google_drive/lib";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import { getParents } from "@connectors/connectors/microsoft/temporal/file";

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: pino.Logger<LoggerOptions & pino.ChildLoggerOptions>
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("Starting migration");

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const spreadsheets = await MicrosoftNodeModel.findAll({
    where: {
      connectorId: connector.id,
      nodeType: "worksheet",
    },
    attributes: ["internalId", "parentInternalId"],
  });
  // get unique parentInternalIds
  const uniqueParentInternalIds = _.uniq(
    spreadsheets.map((s) => s.parentInternalId ?? "error")
  );

  if (uniqueParentInternalIds.filter((id) => id === "error").length > 0) {
    throw new Error("Error getting unique parentInternalIds");
  }

  const result = await concurrentExecutor(
    uniqueParentInternalIds,
    async (parentSpreadsheetId): Promise<number> => {
      const parentSpreadsheet = await MicrosoftNodeResource.fetchByInternalId(
        connector.id,
        parentSpreadsheetId
      );
      if (!parentSpreadsheet) {
        return 0;
      }
      const parents = await getParents({
        connectorId: connector.id,
        internalId: parentSpreadsheet.internalId,
        startSyncTs: 0,
      });
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: parentSpreadsheetId,
        title: parentSpreadsheet.name ?? "Untitled spreadsheet",
        parents,
        parentId: parents[1] ?? null,
        mimeType: MIME_TYPES.MICROSOFT.SPREADSHEET,
        sourceUrl: parentSpreadsheet.webUrl ?? undefined,
      });
      return 1;
    },
    { concurrency: 32 }
  );
  return {
    upserted: result.reduce((acc, curr) => acc + curr, 0),
    notFound: result.filter((r) => r === 0).length,
    total: uniqueParentInternalIds.length,
  };
}

makeScript(
  {
    startId: { type: "number", demandOption: false },
  },
  async ({ execute, startId }, logger) => {
    logger.info("Starting backfill");
    const connectors = await ConnectorResource.listByType("microsoft", {});
    // sort connectors by id
    connectors.sort((a, b) => a.id - b.id);
    // start from startId if provided
    const startIndex = startId
      ? connectors.findIndex((c) => c.id === startId)
      : 0;
    if (startIndex === -1) {
      throw new Error(`Connector with id ${startId} not found`);
    }
    const slicedConnectors = connectors.slice(startIndex);
    for (const connector of slicedConnectors) {
      const result = await migrateConnector(connector, execute, logger);
      logger.info(
        { connectorId: connector.id, result },
        "Backfilled connector"
      );
    }
  }
);
