import type { Logger } from "pino";

import {
  getCorePrimaryDbConnection,
  getFrontPrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { makeScript } from "@app/scripts/helpers";

// async function createNodes(
//     pool: Pool,
//     created: number,
//     dataSource: number,
//     timestamp: number,
//     nodeStringId: string,
//     title: string,
//     mimeType: string,
//     parents: string[],
//     nodeId: number,
//     nodeType: NodeType
// ): Promise<void> {
//     const client = await pool.connect();

//     try {
//         const insertStmt = `
//             INSERT INTO data_sources_nodes
//             (id, created, data_source, timestamp, node_id, title, mime_type, parents, document, "table")
//             VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8, $9)
//             ON CONFLICT DO NOTHING
//         `;

//         const documentId = nodeType === NodeType.Document ? nodeId : null;
//         const tableId = nodeType === NodeType.Table ? nodeId : null;

//         await client.query(insertStmt, [
//             created,
//             dataSource,
//             timestamp,
//             nodeStringId,
//             title,
//             mimeType,
//             JSON.stringify(parents),
//             documentId,
//             tableId,
//         ]);
//     } finally {
//         client.release();
//     }
// }

// async function processBatch(
//     data: Array<[number, number, string, number, string, string, string[]]>,
//     execute: boolean,
//     pool: Pool,
//     nodeType: NodeType
// ): Promise<boolean> {
//     if (!execute) {
//         data.forEach(([id, dataSource, nodeId, timestamp, title, mimeType]) => {
//             console.log(`INSERT ${nodeType} \n ds=${dataSource} \n ts=${timestamp} \n id=${nodeId} \n title=${title} \n mimeType=${mimeType} \n id=${id}`);
//         });
//         return false;
//     }

//     const created = Date.now();

//     await Promise.all(data.map(async ([id, dataSource, nodeId, timestamp, title, mimeType, parents]) => {
//         await createNodes(pool, created, dataSource, timestamp, nodeId, title, mimeType, parents, id, nodeType);
//     }));

//     return true;
// }

async function checkDataSource(
  dataSource: string,
  execute: boolean,
  batchSize: number,
  logger: Logger
): Promise<boolean> {
  console.log(`Checking data source ${dataSource}`);
  const coreSequelize = getCorePrimaryDbConnection();

  const dsResult = await coreSequelize.query(
    "SELECT id FROM data_sources WHERE data_source_id=:dataSource",
    {
      replacements: {
        dataSource,
      },
    }
  );

  const dataSourceId = dsResult[0][0] as { id: number };

  if (!dataSourceId) {
    throw new Error("Data source not found");
  }

  const rows = await coreSequelize.query(
    "SELECT id, node_id, parents FROM data_sources_nodes WHERE data_source=:dsId AND id>:nextId ORDER BY id LIMIT :limit",
    {
      replacements: {
        dsId: dataSourceId.id,
        nextId: 0,
        limit: 100,
      },
    }
  );

  const r = rows[0] as {
    id: number;
    node_id: string;
    parents: string[];
  }[];

  r.forEach(({ id, node_id, parents }) => {
    if (node_id.startsWith("gdrive-")) {
      if (`gdrive-${parents[0]}` !== node_id) {
        if (parents[0] === node_id && `gdrive-${parents[1]}` === node_id) {
          console.log(
            `node id is duplicated: parents[0]=${parents[0]} / parents[1]=${parents[1]}`,
            node_id,
            id,
            parents
          );
        } else {
          console.log(
            `parents[0] does not match ${node_id.substring("gdrive-".length)}`,
            node_id,
            id,
            parents
          );
        }
      }
    } else if (node_id.startsWith("google-spreadsheet-")) {
      if (parents[0] !== node_id) {
        console.log(
          `parents[0] does not match ${node_id}`,
          node_id,
          id,
          parents
        );
      }
    } else {
      console.log("Unknown node format ", node_id);
    }

    if (parents.length > 2 && !parents[parents.length - 1].startsWith("0")) {
      logger.warn(
        `Last parent is not a drive, order is wrong`,
        node_id,
        id,
        parents
      );
    }
  });

  return true;
}

makeScript(
  {
    batchSize: {
      type: "number",
    },
    dataSource: {
      type: "string",
    },
  },
  async ({ execute, batchSize, dataSource }, logger) => {
    const frontSequelize = getFrontPrimaryDbConnection();

    const dsResult = await frontSequelize.query(
      'SELECT "dustAPIDataSourceId" FROM data_sources WHERE "connectorProvider"=\'google_drive\''
    );

    const r = dsResult[0] as {
      dustAPIDataSourceId: string;
    }[];
    const dsIds = r.map((ds) => ds.dustAPIDataSourceId);
    console.log(dsIds);
    if (dataSource) {
      await checkDataSource(dataSource, execute, batchSize, logger);
    } else {
      for (const ds of dsIds) {
        await checkDataSource(ds, execute, batchSize, logger);
      }
    }
  }
);
