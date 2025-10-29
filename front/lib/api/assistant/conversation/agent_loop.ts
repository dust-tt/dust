import assert from "assert";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  AgentMessageType,
  ConversationType,
  ModelId,
  UserMessageType,
} from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function buildAgentLoopArgs(
  auth: Authenticator,
  {
    agentMessageId,
    conversationId,
  }: {
    agentMessageId: string;
    conversationId: string;
  }
): Promise<AgentLoopArgs> {
  const workspace = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const agentMessage = await Message.findOne({
    where: {
      sId: agentMessageId,
      conversationId: conversation.id,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!agentMessage?.agentMessage) {
    throw new Error(`Agent message not found: ${agentMessageId}`);
  }

  if (!agentMessage.parentId) {
    throw new Error(`Agent message has no parent: ${agentMessageId}`);
  }

  const userMessage = await Message.findOne({
    where: {
      id: agentMessage.parentId,
      conversationId: conversation.id,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: true,
      },
    ],
  });

  if (!userMessage?.userMessage) {
    throw new Error(
      `User message not found for agent message: ${agentMessageId}`
    );
  }

  return {
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version ?? 0,
    conversationId: conversation.sId,
    conversationTitle: conversation.title ?? null,
    userMessageId: userMessage.sId,
    userMessageVersion: userMessage.version ?? 0,
  };
}

// Soft assumption that we will not have more than 10 mentions in the same user message.
const MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE = 10;

export const runAgentLoopWorkflow = async ({
  auth,
  agentMessages,
  agentMessageRowById,
  conversation,
  userMessage,
}: {
  auth: Authenticator;
  agentMessages: AgentMessageType[];
  agentMessageRowById: Map<ModelId, AgentMessage>;
  conversation: ConversationType;
  userMessage: UserMessageType;
}) => {
  await concurrentExecutor(
    agentMessages,
    async (agentMessage) => {
      // TODO(DURABLE-AGENTS 2025-07-16): Consolidate around agentMessage.
      const agentMessageRow = agentMessageRowById.get(
        agentMessage.agentMessageId
      );
      assert(
        agentMessageRow,
        `Agent message row not found for agent message ${agentMessage.agentMessageId}`
      );

      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: agentMessage.configuration.sId,
        variant: "full",
      });

      assert(
        agentConfiguration,
        "Unreachable: could not find detailed configuration for agent"
      );

      void launchAgentLoopWorkflow({
        auth,
        agentLoopArgs: {
          agentMessageId: agentMessage.sId,
          agentMessageVersion: agentMessage.version,
          conversationId: conversation.sId,
          conversationTitle: conversation.title,
          userMessageId: userMessage.sId,
          userMessageVersion: userMessage.version,
        },
        startStep: 0,
      });
    },
    { concurrency: MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE }
  );
};
