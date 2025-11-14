import { subDays } from "date-fns";
import { Op } from "sequelize";

import {
  AgentMessage,
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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

  const agentMessages = await Message.findAll({
    where: {
      workspaceId: workspace.id,
      agentMessageId: {
        [Op.ne]: null,
      },
      createdAt: {
        [Op.gte]: since,
      },
    },
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
    order: [["createdAt", "ASC"]],
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      count: agentMessages.length,
    },
    "Found agent messages to process for context_origin"
  );

  if (!agentMessages.length) {
    return;
  }

  // Collect all parent message IDs to fetch userContextOrigin in bulk.
  const parentIds = Array.from(
    new Set(
      agentMessages
        .map((m) => m.parentId)
        .filter((id): id is number => id !== null && id !== undefined)
    )
  );

  if (!parentIds.length) {
    logger.warn(
      {
        workspaceId: workspace.sId,
      },
      "No parent messages found for agent messages when backfilling context_origin"
    );
    return;
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

  const es = await getClient();

  let success = 0;
  let failed = 0;

  // Process in batches to keep bulk requests reasonable.
  await concurrentExecutor(
    Array.from({ length: Math.ceil(agentMessages.length / BATCH_SIZE) }).map(
      (_, i) => i
    ),
    async (batchIndex) => {
      const start = batchIndex * BATCH_SIZE;
      const batch = agentMessages.slice(start, start + BATCH_SIZE);

      if (!batch.length) {
        return;
      }

      if (!execute) {
        logger.info(
          {
            workspaceId: workspace.sId,
            processed: start + batch.length,
            total: agentMessages.length,
          },
          "Dry run - would backfill context_origin for this batch"
        );
        return;
      }

      const body: unknown[] = [];

      for (const msg of batch) {
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

      if (body.length === 0) {
        return;
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

      success += batch.length;
      logger.info(
        {
          workspaceId: workspace.sId,
          processed: start + batch.length,
          total: agentMessages.length,
        },
        "Processed batch for context_origin backfill"
      );
    },
    { concurrency: 5 }
  );

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
