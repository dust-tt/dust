import type { Transaction } from "sequelize";

import {
  AgentMessage,
  Mention,
  Message,
} from "@app/lib/models/assistant/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { isAgentMention } from "@app/types";

export const handleMentions = async ({
  mentions,
  agentConfigurations,
  m,
  owner,
  t,
  skipToolsValidation,
  nextMessageRank,
  conversation,
  userMessage,
}: {
  mentions: MentionType[];
  agentConfigurations: LightAgentConfigurationType[];
  m: Message;
  owner: WorkspaceType;
  t: Transaction;
  skipToolsValidation: boolean;
  nextMessageRank: number;
  conversation: ConversationType;
  userMessage: UserMessageType;
}) => {
  const results = await Promise.all(
    mentions.filter(isAgentMention).map((mention) => {
      // For each assistant/agent mention, create an "empty" agent message.
      return (async () => {
        // `getAgentConfiguration` checks that we're only pulling a configuration from the
        // same workspace or a global one.
        const configuration = agentConfigurations.find(
          (ac) => ac.sId === mention.configurationId
        );
        if (!configuration) {
          return null;
        }

        await Mention.create(
          {
            messageId: m.id,
            agentConfigurationId: configuration.sId,
            workspaceId: owner.id,
          },
          { transaction: t }
        );

        const agentMessageRow = await AgentMessage.create(
          {
            status: "created",
            agentConfigurationId: configuration.sId,
            agentConfigurationVersion: configuration.version,
            workspaceId: owner.id,
            skipToolsValidation,
          },
          { transaction: t }
        );
        const messageRow = await Message.create(
          {
            sId: generateRandomModelSId(),
            rank: nextMessageRank++,
            conversationId: conversation.id,
            parentId: userMessage.id,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
          },
          {
            transaction: t,
          }
        );

        const parentAgentMessageId =
          userMessage.context.origin === "agent_handover"
            ? userMessage.context.originMessageId ?? null
            : null;

        return {
          row: agentMessageRow,
          m: {
            id: messageRow.id,
            agentMessageId: agentMessageRow.id,
            created: agentMessageRow.createdAt.getTime(),
            completedTs: agentMessageRow.completedAt?.getTime() ?? null,
            sId: messageRow.sId,
            type: "agent_message",
            visibility: "visible",
            version: 0,
            parentMessageId: userMessage.sId,
            parentAgentMessageId,
            status: "created",
            actions: [],
            content: null,
            chainOfThought: null,
            rawContents: [],
            error: null,
            configuration,
            rank: messageRow.rank,
            skipToolsValidation: agentMessageRow.skipToolsValidation,
            contents: [],
            parsedContents: {},
          } satisfies AgentMessageType,
        };
      })();
    })
  );

  return results.filter((r) => r !== null) as {
    row: AgentMessage;
    m: AgentMessageType;
  }[];
};
