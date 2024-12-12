import {
  getGoogleSheetContentNodeInternalId,
  getGoogleSheetTableId,
} from "@dust-tt/types";
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
  nextConnectorId,
  execute,
}: {
  nextConnectorId: number;
  execute: boolean;
}) {
  const connectors = await ConnectorModel.findAll({
    where: {
      type: "google_drive",
      id: {
        [Op.gt]: nextConnectorId,
      },
    },
  });

  for (const connector of connectors) {
    logger.info(`Processing connector ${connector.id}...`);

    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const parentsMap: Record<string, string | null> = {};
    let nextId = 0;
    for (;;) {
      const googleDriveFiles = await GoogleDriveFiles.findAll({
        where: {
          connectorId: connector.id,
          id: {
            [Op.gt]: nextId,
          },
        },
      });

      const last = googleDriveFiles[googleDriveFiles.length - 1];
      if (!last) {
        break;
      }

      googleDriveFiles.forEach((folder) => {
        parentsMap[folder.driveFileId] = folder.parentId;
      });

      nextId = last.id;
    }

    nextId = 0;
    for (;;) {
      const googleDriveFiles = await GoogleDriveFiles.findAll({
        where: {
          connectorId: connector.id,
          id: {
            [Op.gt]: nextId,
          },
        },
        order: [["id", "ASC"]],
        limit: QUERY_BATCH_SIZE,
      });

      const last = googleDriveFiles[googleDriveFiles.length - 1];
      if (!last) {
        break;
      }

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
          if (folder) {
            if (folder.parents.join("/") !== parents.join("/")) {
              logger.info(
                { name: file.name, id: file.driveFileId, parents },
                "Upsert folder"
              );

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
          }
        } else {
          const document = await getDocumentFromDataSource({
            dataSourceConfig,
            documentId: internalId,
          });
          if (document) {
            if (document.parents.join("/") !== parents.join("/")) {
              logger.info(
                {
                  name: file.name,
                  id: internalId,
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

        nextId = last.id;
      }
    }

    nextId = 0;
    for (;;) {
      const googleDriveSheets = await GoogleDriveSheet.findAll({
        where: {
          connectorId: connector.id,
          id: {
            [Op.gt]: nextId,
          },
        },
        order: [["id", "ASC"]],
        limit: QUERY_BATCH_SIZE,
      });

      const last = googleDriveSheets[googleDriveSheets.length - 1];
      if (!last) {
        break;
      }

      for (const sheet of googleDriveSheets) {
        const internalId = getGoogleSheetContentNodeInternalId(
          sheet.driveFileId,
          sheet.driveSheetId
        );
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
          if (table.parents.join("/") !== parents.join("/")) {
            logger.info(
              {
                name: sheet.name,
                tableId,
                internalId,
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

        nextId = last.id;
      }
    }
  }
}

makeScript(
  {
    nextConnectorId: {
      type: "number",
      required: false,
      default: 0,
    },
  },
  async ({ nextConnectorId, execute }) => {
    await migrate({
      nextConnectorId,
      execute,
    });
  }
);
