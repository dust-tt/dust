import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getParents } from "@connectors/connectors/notion/lib/parents";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  updateDocumentParentsField,
  updateTableParentsField,
} from "@connectors/lib/data_sources";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function updateParentsFieldForConnector(
  connector: ConnectorResource,
  execute = false
) {
  let pagesIdCursor = 0;
  let databasesIdCursor = 0;

  const pageSize = 512;
  let nodes: (NotionPage | NotionDatabase)[] = [];
  for (;;) {
    const pages = await NotionPage.findAll({
      where: {
        connectorId: connector.id,
        id: {
          [Op.gt]: pagesIdCursor,
        },
      },
      limit: pageSize,
      order: [["id", "ASC"]],
    });
    const databases = await NotionDatabase.findAll({
      where: {
        connectorId: connector.id,
        id: {
          [Op.gt]: databasesIdCursor,
        },
      },
      limit: pageSize,
      order: [["id", "ASC"]],
    });

    if (pages.length > 0) {
      const newCursor = pages[pages.length - 1]?.id;
      if (!newCursor) {
        throw new Error("Last page is undefined");
      }
      pagesIdCursor = newCursor;
    }
    if (databases.length > 0) {
      const newCursor = databases[databases.length - 1]?.id;
      if (!newCursor) {
        throw new Error("Last database is undefined");
      }
      databasesIdCursor = newCursor;
    }

    nodes = [...pages, ...databases];
    if (!nodes.length) {
      break;
    }

    const res = await concurrentExecutor(
      nodes,
      async (node) => {
        const parents = await getParents(
          connector.id,
          "notionPageId" in node ? node.notionPageId : node.notionDatabaseId,
          [],
          undefined
        );

        let documentId: string | null = null;
        let tableId: string | null = null;

        if ("notionPageId" in node) {
          // its a page
          if (node.lastUpsertedTs) {
            documentId = `notion-${node.notionPageId}`;
          }
        } else {
          if (node.structuredDataUpsertedTs) {
            tableId = `notion-${node.notionDatabaseId}`;
          }

          documentId = `notion-database-${node.notionDatabaseId}`;
        }

        if (documentId) {
          if (execute) {
            await updateDocumentParentsField({
              dataSourceConfig: dataSourceConfigFromConnector(connector),
              documentId,
              parents,
            });
          }
        }

        if (tableId) {
          if (execute) {
            await updateTableParentsField({
              dataSourceConfig: dataSourceConfigFromConnector(connector),
              tableId,
              parents,
            });
          }
        }
      },
      { concurrency: 8 }
    );

    console.log(
      `Processed ${res.length} nodes, (pages cursor: ${pagesIdCursor}, databases cursor: ${databasesIdCursor})`
    );
  }

  console.log(
    `Finished processing connector ${connector.id} (workspace ${connector.workspaceId})`
  );
}

makeScript({}, async ({ execute }) => {
  const connectors = await ConnectorResource.listByType("notion", {});

  console.log(`Found ${connectors.length} Notion connectors`);
  for (const connector of connectors) {
    if (connector.errorType) {
      console.log(
        `Skipping connector ${connector.id} (workspace ${connector.workspaceId}) because it has an error`
      );
      continue;
    }
    console.log(
      `Processing connector ${connector.id} (workspace ${connector.workspaceId})`
    );
    await updateParentsFieldForConnector(connector, execute);
  }
});
