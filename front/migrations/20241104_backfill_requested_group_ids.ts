import type { LightWorkspaceType } from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";
import { Op } from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import {
  getConversation,
  updateConversationRequestedGroupIds,
} from "@app/lib/api/assistant/conversation";
import { getAgentConfigurationGroupIdsFromActions } from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  AgentMessage,
  Conversation,
  Message,
} from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function updateRowsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Part 1: Migrate agent configurations.
  const agents = await AgentConfiguration.findAll({
    where: {
      // @ts-expect-error `groupIds` was removed.
      groupIds: {
        [Op.ne]: [], // where `groupIds` is not an empty array.
      },
      workspaceId: workspace.id,
    },
  });

  workspaceLogger.info(`Found ${agents.length} agents to migrate.`);

  const agentChunks = _.chunk(agents, 10);
  for (const chunk of agentChunks) {
    await Promise.all(
      chunk.map(async (agent) => {
        try {
          const [agentConfig] = await getAgentConfigurations({
            auth,
            agentsGetView: { agentIds: [agent.sId] },
            variant: "full",
            dangerouslySkipPermissionFiltering: true,
          });
          if (!agentConfig) {
            workspaceLogger.error(
              { agentId: agent.sId },
              "Agent config not found"
            );
            return;
          }

          const requestedGroupIds =
            await getAgentConfigurationGroupIdsFromActions(
              auth,
              agentConfig.actions
            );

          if (execute) {
            await agent.update({ requestedGroupIds });
            workspaceLogger.info(
              { agentId: agent.sId, requestedGroupIds },
              "Updated agent configuration"
            );
          } else {
            workspaceLogger.info(
              { agentId: agent.sId, requestedGroupIds },
              "Would update agent configuration"
            );
          }
        } catch (error) {
          workspaceLogger.error(
            { agentId: agent.sId, error },
            "Failed to update agent configuration"
          );
        }
      })
    );
  }

  // Part 2: Migrate conversations.
  const conversations = await Conversation.findAll({
    where: {
      // @ts-expect-error `groupIds` was removed.
      groupIds: {
        [Op.ne]: [], // where `groupIds` is not an empty array.
      },
      workspaceId: workspace.id,
    },
  });

  workspaceLogger.info(
    `Found ${conversations.length} conversations to migrate`
  );

  const conversationChunks = _.chunk(conversations, 10);
  for (const chunk of conversationChunks) {
    await Promise.all(
      chunk.map(async (cnv) => {
        try {
          const conversationRes = await getConversation(auth, cnv.sId);
          if (conversationRes.isErr()) {
            workspaceLogger.error(
              { conversationId: cnv.sId },
              "Failed to get conversation"
            );
            return;
          }
          const conversation = conversationRes.value;

          // Get all agent messages from the conversation.
          const messages = await Message.findAll({
            where: {
              conversationId: conversation.id,
            },
            include: [
              {
                model: AgentMessage,
                as: "agentMessage",
                required: true,
              },
            ],
          });

          const agentConfigIds = _.uniq(
            messages
              .map((m) => m.agentMessage?.agentConfigurationId)
              .filter((id): id is string => id !== undefined)
          );

          const mentionedAgents = await getAgentConfigurations({
            auth,
            agentsGetView: { agentIds: agentConfigIds },
            variant: "light",
            dangerouslySkipPermissionFiltering: true,
          });

          await frontSequelize.transaction(async (t) => {
            if (execute) {
              await updateConversationRequestedGroupIds(
                mentionedAgents,
                conversation,
                t
              );
              workspaceLogger.info(
                {
                  conversationId: conversation.sId,
                },
                "Updated conversation"
              );
            } else {
              workspaceLogger.info(
                { conversationId: conversation.sId },
                "Would update conversation"
              );
            }
          });
        } catch (error) {
          workspaceLogger.error(
            { conversationId: cnv.sId, error },
            "Failed to update conversation"
          );
        }
      })
    );
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "The workspace ID to backfill",
      demandOption: false,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    if (workspaceId) {
      const workspace = await Workspace.findOne({
        where: { sId: workspaceId },
      });
      assert(workspace, `Workspace with ID ${workspaceId} not found`);
      return updateRowsForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    }

    await runOnAllWorkspaces(async (workspace) => {
      await updateRowsForWorkspace(workspace, logger, execute);
    });
  }
);
