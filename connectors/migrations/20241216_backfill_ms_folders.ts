import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  getDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {} from "@connectors/lib/models/google_drive";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { concurrentExecutor } from "@connectors/types";

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

async function backfillFolder({
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
    const msFolders: MicrosoftNodeModel[] = await MicrosoftNodeModel.findAll({
      where: {
        connectorId: connector.id,
        id: {
          [Op.gt]: nextId,
        },
        nodeType: { [Op.or]: ["folder", "drive"] },
      },
    });

    msFolders.forEach((file) => {
      parentsMap[file.internalId] = file.parentInternalId;
    });

    nextId = msFolders[msFolders.length - 1]?.id;
  } while (nextId);

  nextId = 0;
  do {
    const msFolders: MicrosoftNodeModel[] = await MicrosoftNodeModel.findAll({
      where: {
        connectorId: connector.id,
        id: {
          [Op.gt]: nextId,
        },
        nodeType: { [Op.or]: ["folder", "drive"] },
      },
      order: [["id", "ASC"]],
      limit: QUERY_BATCH_SIZE,
    });

    await concurrentExecutor(
      msFolders,
      async (file) => {
        const internalId = file.internalId;
        const parents = getParents(
          file.parentInternalId,
          parentsMap,
          childLogger.child({ nodeId: internalId })
        );
        if (!parents) {
          return;
        }
        parents.unshift(internalId);

        const folder = await getDataSourceFolder({
          dataSourceConfig,
          folderId: internalId,
        });
        if (!folder || folder.parents.join("/") !== parents.join("/")) {
          childLogger.info(
            { folderId: file.internalId, parents },
            "Upsert folder"
          );

          if (execute) {
            // upsert repository as folder
            await upsertDataSourceFolder({
              dataSourceConfig,
              folderId: file.internalId,
              parents,
              parentId: file.parentInternalId,
              title: file.name || "",
              mimeType: "application/vnd.dust.microsoft.folder",
            });
          }
        }
      },
      { concurrency: 16 }
    );

    nextId = msFolders[msFolders.length - 1]?.id;
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
        await backfillFolder({
          connector,
          execute,
        });
      }
    } else {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "microsoft",
          id: {
            [Op.gt]: nextConnectorId,
          },
        },
        order: [["id", "ASC"]],
      });

      for (const connector of connectors) {
        await backfillFolder({
          connector,
          execute,
        });
      }
    }
  }
);
