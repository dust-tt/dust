import _ from "lodash";
import { Sequelize } from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { Logger } from "@app/logger/logger";
import { getDataSourceViewIdsFromActions } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import { makeScript } from "@app/scripts/helpers";
import {
  AgentMessage,
  Conversation,
  Message,
} from "@app/lib/models/assistant/conversation";

makeScript({}, async ({ execute }, logger) => {
  // All workspaces that have at least one agent
  const workspaceIds = await getDistinctWorkspaceIds();

  const workspaceChunks = _.chunk(workspaceIds, 8);

  for (const workspaceChunk of workspaceChunks) {
    await Promise.all(
      workspaceChunk.map((id) =>
        updateConversationsForWorkspace(id, execute, logger)
      )
    );
  }
});

async function getDistinctWorkspaceIds(): Promise<number[]> {
  const workspaceIds = await AgentConfiguration.findAll({
    attributes: [
      [Sequelize.fn("DISTINCT", Sequelize.col("workspaceId")), "workspaceId"],
    ],
    raw: true,
  });

  return workspaceIds.map((entry) => entry.workspaceId);
}

async function updateConversationsForWorkspace(
  workspaceId: number,
  execute: boolean,
  logger: Logger
) {
  const conversations = await Conversation.findAll({
    attributes: ["sId", "groupIds"],
    where: { workspaceId },
  });

  logger.info(
    { workspaceId, count: conversations.length },
    "Updating convos for workspace"
  );

  const conversationChunks = _.chunk(conversations, 16);

  // get workspace sid
  const workspace = await Workspace.findByPk(workspaceId);

  if (!workspace) {
    logger.error(
      {
        workspaceId,
      },
      "Unexpected: Workspace not found"
    );
    return;
  }

  for (const conversationChunk of conversationChunks) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await Promise.all(
      conversationChunk.map((conversation) =>
        updateConversation(auth, conversation, execute, logger)
      )
    );
  }
}

async function updateConversation(
  auth: Authenticator,
  conversation: Conversation,
  execute: boolean,
  logger: Logger
) {
  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
        attributes: ["agentConfigurationId"],
      },
    ],
  });

  const agentConfigurationIds = _.uniq(
    messages.map((m) => {
      if (!m.agentMessage) {
        throw new Error("Unexpected: Message without agentMessage");
      }
      return m.agentMessage.agentConfigurationId;
    })
  );

  const groupIds = _.uniq(
    (
      await AgentConfiguration.findAll({
        where: { sId: agentConfigurationIds },
      })
    )
      .map((agent) => agent.groupIds)
      .flat()
  );

  if (execute) {
    await conversation.update({ groupIds });
    logger.info(
      {
        conversationId: conversation.sId,
        execute,
      },
      "Updated agent"
    );
  } else {
    logger.info(
      {
        conversationId: conversation.sId,
        execute,
      },
      "Would have updated agent"
    );
  }
}
