import { QueryTypes } from "sequelize";

import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

async function migrateNodes({
  execute,
  logger,
}: {
  execute: boolean;
  logger: typeof Logger;
}) {
  const coreSequelize = getCorePrimaryDbConnection();
  let nextId = 0;
  let nodes: { id: number }[];

  do {
    nodes = await coreSequelize.query<{ id: number }>(
      `SELECT id, title
       FROM data_sources_nodes
       WHERE id > :nextId
         AND TRIM(title) = ''
       ORDER BY id
       LIMIT :batchSize`,
      {
        replacements: { nextId, batchSize: BATCH_SIZE },
        type: QueryTypes.SELECT,
      }
    );

    if (nodes.length === 0) {
      break;
    }

    logger.info(
      `Processing ${nodes.length} nodes, ids ranging from ${nodes[0].id} to ${nodes[nodes.length - 1].id}`
    );

    if (execute) {
      await coreSequelize.query(
        `UPDATE data_sources_nodes dsn
         SET title = :fallbackName
         FROM (
                SELECT UNNEST(ARRAY [:ids]::bigint[]) AS id
              ) ids
         WHERE dsn.id = ids.id`,
        {
          replacements: {
            ids: nodes.map((n) => n.id),
            fallbackName: UNTITLED_TITLE,
          },
          type: QueryTypes.UPDATE,
        }
      );
    }

    nextId = nodes[nodes.length - 1].id;
  } while (nodes.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  await migrateNodes({ execute, logger });
});
