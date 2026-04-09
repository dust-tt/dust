import { subDays } from "date-fns";
import { Op } from "sequelize";

import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import type { Logger } from "@app/logger/logger";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types/user";
import type { AgentMessageAnalyticsToolUsed } from "@app/types/assistant/analytics";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

const BATCH_SIZE = 1000;

function resolveServerName(action: AgentMCPActionResource): string {
  const toolConfiguration = action.toolConfiguration;
  const toolServerId =
    toolConfiguration &&
    typeof toolConfiguration === "object" &&
    "toolServerId" in toolConfiguration &&
    typeof toolConfiguration.toolServerId === "string"
      ? toolConfiguration.toolServerId
      : null;

  const internalName = toolServerId
    ? getInternalMCPServerNameFromSId(toolServerId)
    : null;

  const mcpServerName =
    toolConfiguration &&
    typeof toolConfiguration === "object" &&
    "mcpServerName" in toolConfiguration &&
    typeof toolConfiguration.mcpServerName === "string"
      ? toolConfiguration.mcpServerName
      : null;

  return (
    internalName ??
    action.metadata.internalMCPServerName ??
    mcpServerName ??
    action.metadata.mcpServerId ??
    toolServerId ??
    "unknown"
  );
}

async function backfillServerNameForWorkspace(
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
    "Starting server_name backfill for agent analytics"
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

  const totalAgentMessages = await MessageModel.count({
    where: baseWhere,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      count: totalAgentMessages,
    },
    "Found agent messages to process for server_name backfill"
  );

  if (!totalAgentMessages) {
    return;
  }

  const es = await getClient();

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let processed = 0;
  let lastId: number | null = null;

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

    const agentMessagesBatch = await MessageModel.findAll({
      where,
      attributes: ["id", "sId", "version"],
      include: [
        {
          model: AgentMessageModel,
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

    const agentMessageIds = agentMessagesBatch
      .map((m) => m.agentMessage?.id)
      .filter((id): id is number => id !== null && id !== undefined);

    if (!agentMessageIds.length) {
      processed += agentMessagesBatch.length;
      lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
      continue;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const actions = await AgentMCPActionResource.listByAgentMessageIds(
      auth,
      agentMessageIds
    );

    if (!actions.length) {
      processed += agentMessagesBatch.length;
      lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
      continue;
    }

    const actionsByAgentMessageId = new Map<number, AgentMCPActionResource[]>();
    for (const action of actions) {
      const list = actionsByAgentMessageId.get(action.agentMessageId) ?? [];
      list.push(action);
      actionsByAgentMessageId.set(action.agentMessageId, list);
    }

    const body: unknown[] = [];

    for (const msg of agentMessagesBatch) {
      const agentMessage = msg.agentMessage;
      if (!agentMessage) {
        continue;
      }

      const msgActions = actionsByAgentMessageId.get(agentMessage.id) ?? [];
      if (!msgActions.length) {
        continue;
      }

      const hasRmsSid = msgActions.some(
        (a) =>
          (a.metadata.mcpServerId ?? "").startsWith("rms_") &&
          !a.metadata.internalMCPServerName
      );

      if (!hasRmsSid) {
        skipped++;
        continue;
      }

      const toolsUsed: AgentMessageAnalyticsToolUsed[] = [];

      for (const action of msgActions) {
        const functionCallName = action.functionCallName;
        if (!functionCallName) {
          continue;
        }

        const toolName =
          functionCallName.split(TOOL_NAME_SEPARATOR).pop() ?? functionCallName;

        toolsUsed.push({
          step_index: action.stepContent.step,
          server_name: resolveServerName(action),
          tool_name: toolName,
          mcp_server_configuration_sid: undefined,
          execution_time_ms: action.executionDurationMs,
          status: action.status,
        });
      }

      if (!toolsUsed.length) {
        continue;
      }

      const id = `${workspace.sId}_${msg.sId}_${msg.version.toString()}`;

      body.push({
        update: {
          _index: ANALYTICS_ALIAS_NAME,
          _id: id,
        },
      });
      body.push({
        doc: {
          tools_used: toolsUsed,
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
          updatesInBatch: body.length / 2,
        },
        "Dry run - would backfill server_name for this batch"
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
          "Failed to update server_name for analytics document"
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
      "Processed batch for server_name backfill"
    );

    lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      success,
      failed,
      skipped,
    },
    "Completed server_name backfill for agent analytics"
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
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillServerNameForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        days,
        execute
      );
    } else {
      await runOnAllWorkspaces(
        async (ws) => {
          await backfillServerNameForWorkspace(ws, logger, days, execute);
        },
        { concurrency: 5 }
      );
    }
  }
);
