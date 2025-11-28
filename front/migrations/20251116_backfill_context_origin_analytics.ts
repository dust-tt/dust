import { subDays } from "date-fns";
import { Op } from "sequelize";

import {
  AgentMessage,
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/agent/conversation";
import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const BATCH_SIZE = 1000;

async function backfillContextOriginForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  days: number,
  execute: boolean
) {
  const since = subDays(new Date(), days);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: since.toISOString(),
    },
    "Starting context_origin backfill for agent analytics"
  );

  const baseWhere = {
    workspaceId: workspace.id,
    agentMessageId: {
      [Op.ne]: null,
    },
    createdAt: {
      [Op.gte]: since,
    },
  };

  const totalAgentMessages = await Message.count({
    where: baseWhere,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      count: totalAgentMessages,
    },
    "Found agent messages to process for context_origin"
  );

  if (!totalAgentMessages) {
    return;
  }

  const es = await getClient();

  let success = 0;
  let failed = 0;
  let processed = 0;
  let lastId: number | null = null;

  // Stream messages from the database in batches to avoid loading
  // everything in memory at once. We iterate using the primary key (id)
  // to paginate.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const where: any = {
      ...baseWhere,
    };

    if (lastId !== null) {
      where.id = {
        [Op.gt]: lastId,
      };
    }

    const agentMessagesBatch = await Message.findAll({
      where,
      attributes: ["id", "sId", "version", "parentId"],
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          required: true,
        },
        {
          model: ConversationModel,
          as: "conversation",
          required: true,
        },
      ],
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (!agentMessagesBatch.length) {
      break;
    }

    const parentIds = Array.from(
      new Set(
        agentMessagesBatch
          .map((m) => m.parentId)
          .filter((id): id is number => id !== null && id !== undefined)
      )
    );

    if (!parentIds.length) {
      logger.warn(
        {
          workspaceId: workspace.sId,
        },
        "No parent messages found for agent messages when backfilling context_origin (batch)"
      );
      processed += agentMessagesBatch.length;
      lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
      continue;
    }

    const parentMessages = await Message.findAll({
      where: {
        id: parentIds,
        workspaceId: workspace.id,
      },
      attributes: ["id"],
      include: [
        {
          model: UserMessage,
          as: "userMessage",
          required: true,
          attributes: ["userContextOrigin"],
        },
      ],
    });

    const originByParentId = new Map<number, string | null>();
    for (const pm of parentMessages) {
      const origin = pm.userMessage?.userContextOrigin ?? null;
      originByParentId.set(pm.id, origin);
    }

    const body: unknown[] = [];

    for (const msg of agentMessagesBatch) {
      if (!msg.parentId) {
        continue;
      }
      const origin = originByParentId.get(msg.parentId) ?? "unknown";

      const id = `${workspace.sId}_${msg.sId}_${msg.version.toString()}`;

      body.push({
        update: {
          _index: ANALYTICS_ALIAS_NAME,
          _id: id,
        },
      });
      body.push({
        doc: {
          context_origin: origin ?? "unknown",
        },
      });
    }

    if (!body.length) {
      processed += agentMessagesBatch.length;
      lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
      continue;
    }

    if (!execute) {
      processed += agentMessagesBatch.length;
      lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
      logger.info(
        {
          workspaceId: workspace.sId,
          processed,
          total: totalAgentMessages,
        },
        "Dry run - would backfill context_origin for this batch"
      );
      continue;
    }

    const resp = await es.bulk({
      index: ANALYTICS_ALIAS_NAME,
      body,
      refresh: false,
    });

    if (resp.errors) {
      for (const item of resp.items ?? []) {
        const update = item.update;
        if (!update || !update.error) {
          continue;
        }
        failed++;
        logger.warn(
          {
            error: update.error,
            id: update._id,
          },
          "Failed to update context_origin for analytics document"
        );
      }
    }

    success += agentMessagesBatch.length;
    processed += agentMessagesBatch.length;

    logger.info(
      {
        workspaceId: workspace.sId,
        processed,
        total: totalAgentMessages,
      },
      "Processed batch for context_origin backfill"
    );

    lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      success,
      failed,
    },
    "Completed context_origin backfill for agent analytics"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Run on a single workspace (optional, sId)",
    },
    days: {
      type: "number",
      demandOption: false,
      default: 90,
      description:
        "Only backfill messages created in the last N days (default: 90)",
    },
  },
  async ({ execute, workspaceId, days }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceModel.findOne({
        where: {
          sId: workspaceId,
        },
      });

      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillContextOriginForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        days,
        execute
      );
    } else {
      await runOnAllWorkspaces(
        async (ws) => {
          await backfillContextOriginForWorkspace(ws, logger, days, execute);
        },
        { concurrency: 5 }
      );
    }
  }
);
