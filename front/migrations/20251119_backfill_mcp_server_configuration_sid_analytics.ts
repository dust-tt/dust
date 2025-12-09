import { subDays } from "date-fns";
import { Op } from "sequelize";

import { ANALYTICS_ALIAS_NAME, getClient } from "@app/lib/api/elasticsearch";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import {
  AgentMessage,
  ConversationModel,
  Message,
} from "@app/lib/models/agent/conversation";
import type { Logger } from "@app/logger/logger";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types";
import type { AgentMessageAnalyticsToolUsed } from "@app/types/assistant/analytics";

const BATCH_SIZE = 1000;

async function backfillMcpServerConfigurationSidForWorkspace(
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
    "Starting mcp_server_configuration_sid backfill for agent analytics"
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
    "Found agent messages to process for mcp_server_configuration_sid"
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
      attributes: ["id", "sId", "version"],
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

    const uniqueConfigIds = Array.from(
      new Set(actions.map((a) => a.mcpServerConfigurationId))
    );

    const serverConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        id: uniqueConfigIds,
      },
    });

    const configIdToSid = new Map<string, string>();
    for (const cfg of serverConfigs) {
      configIdToSid.set(cfg.id.toString(), cfg.sId);
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

      const toolsUsed: AgentMessageAnalyticsToolUsed[] = [];

      for (const action of msgActions) {
        const sid = configIdToSid.get(action.mcpServerConfigurationId);
        if (!sid) {
          continue;
        }

        const functionCallName = action.functionCallName;
        if (!functionCallName) {
          continue;
        }

        const toolName =
          functionCallName.split(TOOL_NAME_SEPARATOR).pop() ?? functionCallName;

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

        const serverName =
          internalName ??
          action.metadata.internalMCPServerName ??
          action.metadata.mcpServerId ??
          toolServerId ??
          "unknown";

        toolsUsed.push({
          step_index: action.stepContent.step,
          server_name: serverName,
          tool_name: toolName,
          mcp_server_configuration_sid: sid,
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
        },
        "Dry run - would backfill mcp_server_configuration_sid for this batch"
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
          "Failed to update tools_used for analytics document"
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
      "Processed batch for mcp_server_configuration_sid backfill"
    );

    lastId = agentMessagesBatch[agentMessagesBatch.length - 1].id;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      success,
      failed,
    },
    "Completed mcp_server_configuration_sid backfill for agent analytics"
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

      await backfillMcpServerConfigurationSidForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        days,
        execute
      );
    } else {
      await runOnAllWorkspaces(
        async (ws) => {
          await backfillMcpServerConfigurationSidForWorkspace(
            ws,
            logger,
            days,
            execute
          );
        },
        { concurrency: 5 }
      );
    }
  }
);
