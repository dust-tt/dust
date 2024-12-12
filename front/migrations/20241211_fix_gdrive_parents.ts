import type { Logger } from "pino";

import {
  getCoreReplicaDbConnection,
  getFrontReplicaDbConnection,
} from "@app/lib/production_checks/utils";
import { makeScript } from "@app/scripts/helpers";

async function checkDataSource(
  dataSource: string,
  execute: boolean,
  batchSize: number,
  logger: Logger
): Promise<boolean> {
  logger.info(`Checking data source ${dataSource}`);
  const coreSequelize = getCoreReplicaDbConnection();

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
          logger.warn(
            { node_id, id, parents },
            `node id is duplicated: parents[0]=${parents[0]} / parents[1]=${parents[1]}`
          );
        } else {
          logger.warn(
            { node_id, id, parents },
            `parents[0] does not match ${node_id.substring("gdrive-".length)}`
          );
        }
      }
    } else if (node_id.startsWith("google-spreadsheet-")) {
      if (parents[0] !== node_id) {
        logger.warn(
          { node_id, id, parents },
          `parents[0] does not match ${node_id}`
        );
      }
    } else {
      logger.warn("Unknown node format ", node_id);
    }

    if (parents.length > 2 && !parents[parents.length - 1].startsWith("0")) {
      logger.warn(
        { node_id, id, parents },
        `Last parent is not a drive, order is wrong`
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
    const frontSequelize = getFrontReplicaDbConnection();

    const dsResult = await frontSequelize.query(
      'SELECT "dustAPIDataSourceId" FROM data_sources WHERE "connectorProvider"=\'google_drive\''
    );

    const r = dsResult[0] as {
      dustAPIDataSourceId: string;
    }[];
    const dsIds = r.map((ds) => ds.dustAPIDataSourceId);

    if (dataSource) {
      await checkDataSource(dataSource, execute, batchSize, logger);
    } else {
      for (const ds of dsIds) {
        await checkDataSource(ds, execute, batchSize, logger);
      }
    }
  }
);
