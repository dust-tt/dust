import type { Transaction } from "sequelize";

import {
  AgentMessage,
  Mention,
  Message,
} from "@app/lib/models/assistant/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { MentionType } from "@app/types";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { isAgentMention, isUserMention } from "@app/types";

export const createUserMessages = async ({
  mentions,
  message,
  owner,
  transaction,
}: {
  mentions: MentionType[];
  message: Message;
  owner: WorkspaceType;
  transaction: Transaction;
}) => {
  // Store user mentions in the database
  await Promise.all(
    mentions.filter(isUserMention).map((mention) =>
      Mention.create(
        {
          messageId: message.id,
          userId: parseInt(mention.userId, 10),
          workspaceId: owner.id,
        },
        { transaction }
      )
    )
  );
};

export const createAgentMessages = async ({
  mentions,
  agentConfigurations,
  message,
  owner,
  transaction,
  skipToolsValidation,
  nextMessageRank,
  conversation,
  userMessage,
}: {
  mentions: MentionType[];
  agentConfigurations: LightAgentConfigurationType[];
  message: Message;
  owner: WorkspaceType;
  transaction: Transaction;
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
            messageId: message.id,
            agentConfigurationId: configuration.sId,
            workspaceId: owner.id,
          },
          { transaction }
        );

        const agentMessageRow = await AgentMessage.create(
          {
            status: "created",
            agentConfigurationId: configuration.sId,
            agentConfigurationVersion: configuration.version,
            workspaceId: owner.id,
            skipToolsValidation,
          },
          { transaction }
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
          { transaction }
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
            modelInteractionDurationMs:
              agentMessageRow.modelInteractionDurationMs,
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
