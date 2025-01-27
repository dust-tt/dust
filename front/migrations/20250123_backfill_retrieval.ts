import type { LightWorkspaceType } from "@dust-tt/types";
import { Op, Sequelize } from "sequelize";

import {
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import type { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

interface TableConfig {
  model: typeof WorkspaceAwareModel<any>;
  attributes?: string[];
  where: (workspaceId: number, lastSeenId: number) => any;
}

const TABLES: TableConfig[] = [
  {
    model: RetrievalDocument,
    attributes: ["id", "workspaceId", "dataSourceViewId"],
    where: (workspaceId: number, lastSeenId: number) => ({
      retrievalActionId: {
        [Op.in]: Sequelize.literal(
          `(SELECT id FROM agent_retrieval_actions WHERE "workspaceId" = ${workspaceId}) AND id > ${lastSeenId}`
        ),
      },
    }),
  },
  {
    model: RetrievalDocumentChunk,
    attributes: ["id", "retrievalDocumentId"],
    where: (workspaceId: number, lastSeenId: number) => ({
      retrievalDocumentId: {
        [Op.in]: Sequelize.literal(
          `(SELECT id FROM retrieval_documents WHERE "workspaceId" = ${workspaceId} AND id > ${lastSeenId})`
        ),
      },
    }),
  },
];

async function backfillTable(
  workspace: LightWorkspaceType,
  table: TableConfig,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastSeenId = 0;
  const batchSize = 1000;
  let totalProcessed = 0;

  logger.info(
    { workspaceId: workspace.sId, table: table.model.tableName },
    "Starting table backfill"
  );

  for (;;) {
    const records = await table.model.findAll({
      where: {
        id: { [Op.gt]: lastSeenId },
        workspaceId: { [Op.is]: null },
        ...(table.where(workspace.id, lastSeenId) || {}),
      },
      order: [["id", "ASC"]],
      limit: batchSize,
      attributes: table.attributes,
    });

    if (records.length === 0) {
      break;
    }

    totalProcessed += records.length;
    logger.info(
      {
        workspaceId: workspace.sId,
        table: table.model.tableName,
        batchSize: records.length,
        totalProcessed,
        lastId: lastSeenId,
      },
      "Processing batch"
    );

    if (execute) {
      const recordIds = records.map((r) => r.id);
      await table.model.update(
        { workspaceId: workspace.id },
        {
          where: {
            id: { [Op.in]: recordIds },
          },
          hooks: false,
          fields: ["workspaceId"],
          silent: true,
        }
      );
    }

    lastSeenId = records[records.length - 1].id;
  }

  return totalProcessed;
}

async function backfillTablesForWorkspace(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting workspace backfill"
  );

  const stats: any = {};
  for (const table of TABLES) {
    stats[table.model.tableName] = await backfillTable(workspace, table, {
      execute,
      logger,
    });
  }

  logger.info(
    { workspaceId: workspace.sId, stats },
    "Completed workspace backfill"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(
    async (workspace) => {
      await backfillTablesForWorkspace(workspace, { execute, logger });
    },
    { concurrency: 5 }
  );
});
