import { getGoogleSheetTableId } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  getDocumentFromDataSource,
  getFolderNode,
  getTable,
  updateDocumentParentsField,
  updateTableParentsField,
  upsertFolderNode,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const QUERY_BATCH_SIZE = 1024;

async function migrate({
  connector,
  execute,
}: {
  connector: ConnectorModel;
  execute: boolean;
}) {
  logger.info(`Processing connector ${connector.id}...`);

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
        },
        order: [["id", "ASC"]],
        limit: QUERY_BATCH_SIZE,
      }
    );

    for (const file of googleDriveFiles) {
      const internalId = file.dustFileId;
      const driveFileId = file.driveFileId;
      const parents = [driveFileId];
      let current: string | null = file.parentId;
      while (current) {
        parents.push(current);
        current = parentsMap[current] || null;
      }

      if (file.mimeType === "application/vnd.google-apps.folder") {
        const folder = await getFolderNode({
          dataSourceConfig,
          folderId: internalId,
        });
        if (!folder || folder.parents.join("/") !== parents.join("/")) {
          logger.info({ folderId: file.driveFileId, parents }, "Upsert folder");

          if (execute) {
            // upsert repository as folder
            await upsertFolderNode({
              dataSourceConfig,
              folderId: file.dustFileId,
              parents,
              parentId: file.parentId,
              title: file.name,
            });
          }
        }
      } else {
        const document = await getDocumentFromDataSource({
          dataSourceConfig,
          documentId: internalId,
        });
        if (document) {
          logger.info(
            {
              documentId: file.driveFileId,
            },
            "Found document"
          );
          if (document.parents.join("/") !== parents.join("/")) {
            logger.info(
              {
                documentId: internalId,
                parents,
                previousParents: document.parents,
              },
              "Update parents for document"
            );

            if (execute) {
              await updateDocumentParentsField({
                dataSourceConfig,
                documentId: file.dustFileId,
                parents,
              });
            }
          }
        }
      }
    }

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

    for (const sheet of googleDriveSheets) {
      const tableId = getGoogleSheetTableId(
        sheet.driveFileId,
        sheet.driveSheetId
      );
      const parents = [tableId];
      let current: string | null = sheet.driveFileId;
      while (current) {
        parents.push(current);
        current = parentsMap[current] || null;
      }

      const table = await getTable({ dataSourceConfig, tableId });
      if (table) {
        logger.info(
          {
            tableId: tableId,
          },
          "Found table"
        );

        if (table.parents.join("/") !== parents.join("/")) {
          logger.info(
            {
              tableId,
              parents,
              previousParents: table.parents,
            },
            "Update parents for table"
          );
          if (execute) {
            await updateTableParentsField({
              dataSourceConfig,
              tableId,
              parents,
            });
          }
        }
      }
    }

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
