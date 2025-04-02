import _ from "lodash";
import { Op } from "sequelize";

import {
  AgentMessage,
  ConversationModel,
  ConversationParticipantModel,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

type TableConfig = {
  model: typeof WorkspaceAwareModel<any>;
  include: (workspaceId: number) => any[];
};

const TABLES: TableConfig[] = [
  {
    model: ConversationParticipantModel,
    include: (workspaceId: number) => [
      {
        model: ConversationModel,
        required: true,
        where: { workspaceId },
      },
    ],
  },
  {
    model: Message,
    include: (workspaceId: number) => [
      {
        as: "conversation",
        model: ConversationModel,
        required: true,
        where: { workspaceId },
      },
    ],
  },
  {
    model: UserMessage,
    include: (workspaceId: number) => [
      {
        as: "message",
        model: Message,
        required: true,
        include: [
          {
            as: "conversation",
            model: ConversationModel,
            required: true,
            where: { workspaceId },
          },
        ],
      },
    ],
  },
  {
    model: AgentMessage,
    include: (workspaceId: number) => [
      {
        as: "message",
        model: Message,
        required: true,
        include: [
          {
            as: "conversation",
            model: ConversationModel,
            required: true,
            where: { workspaceId },
          },
        ],
      },
    ],
  },
  {
    model: ContentFragmentModel,
    include: (workspaceId: number) => [
      {
        as: "message",
        model: Message,
        required: true,
        include: [
          {
            as: "conversation",
            model: ConversationModel,
            required: true,
            where: { workspaceId },
          },
        ],
      },
    ],
  },
  {
    model: MessageReaction,
    include: (workspaceId: number) => [
      {
        model: Message,
        required: true,
        include: [
          {
            as: "conversation",
            model: ConversationModel,
            required: true,
            where: { workspaceId },
          },
        ],
      },
    ],
  },
  {
    model: Mention,
    include: (workspaceId: number) => [
      {
        model: Message,
        required: true,
        include: [
          {
            as: "conversation",
            model: ConversationModel,
            required: true,
            where: { workspaceId },
          },
        ],
      },
    ],
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
      },
      order: [["id", "ASC"]],
      limit: batchSize,
      include: table.include(workspace.id),
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
          // Required to avoid hitting validation hook, which does not play nice with bulk updates.
          hooks: false,
          // Do not update `updatedAt.
          silent: true,
          fields: ["workspaceId"],
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
    { concurrency: 10 }
  );
});
