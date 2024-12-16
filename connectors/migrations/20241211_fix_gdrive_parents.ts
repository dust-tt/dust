import { getGoogleSheetTableId } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getDocumentId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  getFolderNode,
  getTable,
  updateTableParentsField,
  upsertFolderNode,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const QUERY_BATCH_SIZE = 1024;

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

    for (const file of googleDriveFiles) {
      const internalId = file.dustFileId;
      const driveFileId = file.driveFileId;
      const parents = getParents(
        file.parentId,
        parentsMap,
        childLogger.child({ nodeId: driveFileId })
      );
      if (!parents) {
        continue;
      }
      parents.unshift(driveFileId);

      if (file.mimeType === "application/vnd.google-apps.folder") {
        const folder = await getFolderNode({
          dataSourceConfig,
          folderId: internalId,
        });
        const newParents = parents.map((id) => getDocumentId(id));
        if (!folder || folder.parents.join("/") !== newParents.join("/")) {
          childLogger.info(
            { folderId: file.driveFileId, parents: newParents },
            "Upsert folder"
          );

          if (execute) {
            // upsert repository as folder
            await upsertFolderNode({
              dataSourceConfig,
              folderId: file.dustFileId,
              parents: newParents,
              parentId: file.parentId ? getDocumentId(file.parentId) : null,
              title: file.name,
            });
          }
        }
      } else if (file.mimeType === "text/csv") {
        const tableId = internalId;
        parents.unshift(...parents.map((id) => getDocumentId(id)));
        const table = await getTable({ dataSourceConfig, tableId });
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
              await updateTableParentsField({
                dataSourceConfig,
                tableId,
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

      const parents = getParents(
        sheet.driveFileId,
        parentsMap,
        childLogger.child({ nodeId: tableId })
      );
      if (!parents) {
        continue;
      }

      parents.unshift(...parents.map((id) => getDocumentId(id)));
      parents.unshift(tableId);

      const table = await getTable({ dataSourceConfig, tableId });
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
