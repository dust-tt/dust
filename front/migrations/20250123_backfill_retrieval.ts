import _ from "lodash";
import { Op, Sequelize } from "sequelize";

import {
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import type { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

interface TableConfig {
  model: typeof WorkspaceAwareModel<any>;
  attributes?: string[];
  where: (workspaceId: number, lastSeenId: number) => any;
}

const TABLE_RETRIEVAL_DOCUMENT: TableConfig = {
  model: RetrievalDocument,
  attributes: ["id", "workspaceId", "dataSourceViewId"],
  where: (workspaceId: number, lastSeenId: number) => ({
    retrievalActionId: {
      [Op.in]: Sequelize.literal(
        `(SELECT id FROM agent_retrieval_actions WHERE "workspaceId" = ${workspaceId}) AND id > ${lastSeenId}`
      ),
    },
  }),
};

const TABLE_RETRIEVAL_DOCUMENT_CHUNK: TableConfig = {
  model: RetrievalDocumentChunk,
  attributes: ["id", "retrievalDocumentId"],
  where: (workspaceId: number, lastSeenId: number) => ({
    retrievalDocumentId: {
      [Op.in]: Sequelize.literal(
        `(SELECT id FROM retrieval_documents WHERE "workspaceId" = ${workspaceId} AND id > ${lastSeenId})`
      ),
    },
  }),
};

async function backfillTableRetrievalDocumentChunk(
  workspace: LightWorkspaceType,
  table: TableConfig,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastSeenId = 0;
  const batchSize = 1000;

  logger.info(
    { workspaceId: workspace.sId, table: table.model.tableName },
    "Starting table backfill"
  );

  for (;;) {
    const documents: RetrievalDocument[] = await RetrievalDocument.findAll({
      where: {
        id: { [Op.gt]: lastSeenId },
        workspaceId: workspace.id,
      },
      attributes: ["id", "workspaceId"],
      limit: batchSize,
      order: [["id", "ASC"]],
    });

    if (documents.length === 0) {
      break;
    }

    if (execute) {
      await RetrievalDocumentChunk.update(
        {
          workspaceId: workspace.id,
        },
        {
          where: {
            retrievalDocumentId: { [Op.in]: documents.map((d) => d.id) },
          },
          hooks: false,
          silent: true,
        }
      );
    }

    lastSeenId = documents[documents.length - 1].id;
    logger.info({}, `Processed batch up to id ${lastSeenId}`);
  }

  return;
}

async function backfillTableRetrievalDocument(
  workspace: LightWorkspaceType,
  table: TableConfig,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastSeenId = 0;
  const batchSize = 100;
  let totalProcessed = 0;

  logger.info(
    { workspaceId: workspace.sId, table: table.model.tableName },
    "Starting table backfill"
  );

  for (;;) {
    const ids = await table.model.findAll({
      where: {
        id: { [Op.gt]: lastSeenId },
        workspaceId: { [Op.is]: null },
        retrievalActionId: {
          [Op.in]: Sequelize.literal(
            `(SELECT id FROM agent_retrieval_actions WHERE "workspaceId" = ${workspace.id})`
          ),
        },
      },
      attributes: ["id"],
      order: [["id", "ASC"]],
      limit: batchSize,
      raw: true,
    });

    if (ids.length === 0) {
      break;
    }

    if (execute) {
      const chunks = _.chunk(
        ids.map((r) => r.id),
        100
      );
      for (const chunk of chunks) {
        await table.model.update(
          { workspaceId: workspace.id },
          {
            where: {
              id: { [Op.in]: chunk },
            },
            hooks: false,
            fields: ["workspaceId"],
            silent: true,
          }
        );
      }
    }

    totalProcessed += ids.length;
    lastSeenId = ids[ids.length - 1].id;

    logger.info(
      {
        workspaceId: workspace.sId,
        table: table.model.tableName,
        batchSize: ids.length,
        totalProcessed,
        lastId: lastSeenId,
      },
      "Processing batch"
    );
  }

  return totalProcessed;
}

async function backfillTablesForWorkspace(
  workspace: LightWorkspaceType,
  table: string,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  const stats: any = {};

  if (table === "retrieval_documents") {
    stats[TABLE_RETRIEVAL_DOCUMENT.model.tableName] =
      await backfillTableRetrievalDocument(
        workspace,
        TABLE_RETRIEVAL_DOCUMENT,
        {
          execute,
          logger,
        }
      );
  } else if (table === "retrieval_document_chunks") {
    stats[TABLE_RETRIEVAL_DOCUMENT_CHUNK.model.tableName] =
      await backfillTableRetrievalDocumentChunk(
        workspace,
        TABLE_RETRIEVAL_DOCUMENT_CHUNK,
        {
          execute,
          logger,
        }
      );
  } else {
    return;
  }

  logger.info(
    { workspaceId: workspace.sId, stats },
    `Completed workspace backfill for table ${table}`
  );
}

makeScript(
  {
    table: { type: "string", required: true },
  },
  async ({ execute, table }, logger) => {
    return runOnAllWorkspaces(
      async (workspace: LightWorkspaceType) => {
        await backfillTablesForWorkspace(workspace, table, { execute, logger });
      },
      { concurrency: 5 }
    );
  }
);
