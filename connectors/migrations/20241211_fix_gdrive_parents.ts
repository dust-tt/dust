import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  getDataSourceFolder,
  getDataSourceTable,
  updateDataSourceTableParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { concurrentExecutor, getGoogleSheetTableId } from "@connectors/types";

const QUERY_BATCH_SIZE = 1024;
const DOCUMENT_CONCURRENCY = 16;
const TABLE_CONCURRENCY = 16;

function getParents(
  fileId: string | null,
  parentsMap: Record<string, string | null>,
  logger: Logger
) {
  const parents = [];
  let current: string | null = fileId;
  while (current) {
    parents.push(current);
    if (typeof parentsMap[current] === "undefined") {
      logger.error({ fileId: current }, "Parent not found");
      return null;
    }
    current = parentsMap[current] || null;
  }
  return parents;
}

async function migrate({
  connector,
  execute,
}: {
  connector: ConnectorModel;
  execute: boolean;
}) {
  const childLogger = logger.child({ connectorId: connector.id });
  childLogger.info(`Processing connector ${connector.id}...`);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const parentsMap: Record<string, string | null> = {};
  let nextId: number | undefined = 0;
  do {
    const googleDriveFiles: GoogleDriveFiles[] = await GoogleDriveFiles.findAll(
      {
        where: {
          connectorId: connector.id,
          id: {
            [Op.gt]: nextId,
          },
        },
      }
    );

    googleDriveFiles.forEach((file) => {
      parentsMap[file.driveFileId] = file.parentId;
    });

    nextId = googleDriveFiles[googleDriveFiles.length - 1]?.id;
  } while (nextId);

  nextId = 0;
  do {
    const googleDriveFiles: GoogleDriveFiles[] = await GoogleDriveFiles.findAll(
      {
        where: {
          connectorId: connector.id,
          id: {
            [Op.gt]: nextId,
          },
          mimeType: {
            [Op.or]: ["application/vnd.google-apps.folder", "text/csv"],
          },
        },
        order: [["id", "ASC"]],
        limit: QUERY_BATCH_SIZE,
      }
    );

    await concurrentExecutor(
      googleDriveFiles,
      async (file) => {
        const internalId = file.dustFileId;
        const driveFileId = file.driveFileId;
        const parents = getParents(
          file.parentId,
          parentsMap,
          childLogger.child({ nodeId: driveFileId })
        );
        if (!parents) {
          return;
        }
        parents.unshift(driveFileId);

        if (file.mimeType === "application/vnd.google-apps.folder") {
          const folder = await getDataSourceFolder({
            dataSourceConfig,
            folderId: internalId,
          });
          const newParents = parents.map((id) => getInternalId(id));
          if (!folder || folder.parents.join("/") !== newParents.join("/")) {
            childLogger.info(
              { folderId: file.driveFileId, parents: newParents },
              "Upsert folder"
            );

            if (execute) {
              // upsert repository as folder
              await upsertDataSourceFolder({
                dataSourceConfig,
                folderId: file.dustFileId,
                parents: newParents,
                parentId: file.parentId ? getInternalId(file.parentId) : null,
                title: file.name,
                mimeType: "application/vnd.dust.googledrive.folder",
              });
            }
          }
        } else if (file.mimeType === "text/csv") {
          const tableId = internalId;
          parents.unshift(...parents.map((id) => getInternalId(id)));
          const table = await getDataSourceTable({ dataSourceConfig, tableId });
          if (table) {
            if (table.parents.join("/") !== parents.join("/")) {
              childLogger.info(
                {
                  tableId,
                  parents,
                  previousParents: table.parents,
                },
                "Update parents for table"
              );
              if (execute) {
                await updateDataSourceTableParents({
                  dataSourceConfig,
                  tableId,
                  parents,
                  parentId: parents[1] || null,
                });
              }
            }
          }
        }
      },
      { concurrency: DOCUMENT_CONCURRENCY }
    );

    nextId = googleDriveFiles[googleDriveFiles.length - 1]?.id;
  } while (nextId);

  nextId = 0;
  do {
    const googleDriveSheets: GoogleDriveSheet[] =
      await GoogleDriveSheet.findAll({
        where: {
          connectorId: connector.id,
          id: {
            [Op.gt]: nextId,
          },
        },
        order: [["id", "ASC"]],
        limit: QUERY_BATCH_SIZE,
      });

    await concurrentExecutor(
      googleDriveSheets,
      async (sheet) => {
        const tableId = getGoogleSheetTableId(
          sheet.driveFileId,
          sheet.driveSheetId
        );

        const parents = getParents(
          sheet.driveFileId,
          parentsMap,
          childLogger.child({ nodeId: tableId })
        );
        if (!parents) {
          return;
        }

        parents.unshift(...parents.map((id) => getInternalId(id)));
        parents.unshift(tableId);

        const table = await getDataSourceTable({ dataSourceConfig, tableId });
        if (table) {
          if (table.parents.join("/") !== parents.join("/")) {
            childLogger.info(
              {
                tableId,
                parents,
                previousParents: table.parents,
              },
              "Update parents for table"
            );
            if (execute) {
              await updateDataSourceTableParents({
                dataSourceConfig,
                tableId,
                parents,
                parentId: parents[1] || null,
              });
            }
          }
        }
      },
      { concurrency: TABLE_CONCURRENCY }
    );

    nextId = googleDriveSheets[googleDriveSheets.length - 1]?.id;
  } while (nextId);
}

makeScript(
  {
    nextConnectorId: {
      type: "number",
      required: false,
      default: 0,
    },
    connectorId: {
      type: "number",
      required: false,
      default: 0,
    },
  },
  async ({ nextConnectorId, connectorId, execute }) => {
    if (connectorId) {
      const connector = await ConnectorModel.findByPk(connectorId);
      if (connector) {
        await migrate({
          connector,
          execute,
        });
      }
    } else {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "google_drive",
          id: {
            [Op.gt]: nextConnectorId,
          },
        },
        order: [["id", "ASC"]],
      });

      for (const connector of connectors) {
        await migrate({
          connector,
          execute,
        });
      }
    }
  }
);
