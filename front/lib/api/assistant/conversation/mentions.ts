import type { Transaction } from "sequelize";

import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessage,
  Mention,
  Message,
} from "@app/lib/models/agent/conversation";
import { triggerConversationAddedAsParticipantNotification } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  MentionType,
} from "@app/types";
import type {
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { assertNever, isAgentMention, isUserMention } from "@app/types";

export const createUserMentions = async (
  auth: Authenticator,
  {
    mentions,
    message,
    conversation,
    transaction,
  }: {
    mentions: MentionType[];
    message: Message;
    conversation: ConversationWithoutContentType;
    transaction?: Transaction;
  }
) => {
  // Store user mentions in the database
  await Promise.all(
    mentions.filter(isUserMention).map(async (mention) => {
      // check if the user exists in the workspace before creating the mention
      const user = await getUserForWorkspace(auth, { userId: mention.userId });
      if (user) {
        await Mention.create(
          {
            messageId: message.id,
            userId: user.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          { transaction }
        );

        const status = await ConversationResource.upsertParticipation(auth, {
          conversation,
          action: "subscribed",
          user: user.toJSON(),
        });

        const featureFlags = await getFeatureFlags(
          auth.getNonNullableWorkspace()
        );

        if (status === "added" && featureFlags.includes("notifications")) {
          await triggerConversationAddedAsParticipantNotification(auth, {
            conversation,
            addedUserId: user.sId,
          });
        }
      }
    })
  );
};

export const createAgentMessages = async ({
  owner,
  conversation,
  metadata,
  transaction,
}: {
  owner: WorkspaceType;
  conversation: ConversationWithoutContentType;
  metadata:
    | {
        type: "retry";
        message: Message;
        agentMessage: AgentMessageType;
      }
    | {
        type: "create";
        mentions: MentionType[];
        agentConfigurations: LightAgentConfigurationType[];
        message: Message;
        skipToolsValidation: boolean;
        nextMessageRank: number;
        userMessage: UserMessageType;
      };
  transaction?: Transaction;
}) => {
  const results: {
    agentMessageRow: AgentMessage;
    messageRow: Message;
    configuration: LightAgentConfigurationType;
    parentMessageId: string | null;
    parentAgentMessageId: string | null;
  }[] = [];

  switch (metadata.type) {
    case "retry":
      {
        const previousAgentMessage = metadata.message.agentMessage;
        if (!previousAgentMessage) {
          throw new Error("Previous agent message not found");
        }
        const agentMessageRow = await AgentMessage.create(
          {
            status: "created",
            agentConfigurationId: previousAgentMessage.agentConfigurationId,
            agentConfigurationVersion:
              previousAgentMessage.agentConfigurationVersion,
            workspaceId: owner.id,
            skipToolsValidation: previousAgentMessage.skipToolsValidation,
          },
          { transaction }
        );
        const messageRow = await Message.create(
          {
            sId: generateRandomModelSId(),
            rank: metadata.message.rank,
            conversationId: conversation.id,
            parentId: metadata.message.parentId,
            version: metadata.message.version + 1,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
          },
          {
            transaction,
          }
        );

        results.push({
          agentMessageRow,
          messageRow,
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
        });
      }
      break;

    case "create":
      {
        await concurrentExecutor(
          metadata.mentions.filter(isAgentMention),
          async (mention) => {
            const configuration = metadata.agentConfigurations.find(
              (ac) => ac.sId === mention.configurationId
            );
            if (!configuration) {
              return;
            }

            await Mention.create(
              {
                messageId: metadata.message.id,
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
                skipToolsValidation: metadata.skipToolsValidation,
              },
              { transaction }
            );
            const messageRow = await Message.create(
              {
                sId: generateRandomModelSId(),
                rank: metadata.nextMessageRank++,
                conversationId: conversation.id,
                parentId: metadata.userMessage.id,
                agentMessageId: agentMessageRow.id,
                workspaceId: owner.id,
              },
              { transaction }
            );

            const parentAgentMessageId =
              metadata.userMessage.agenticMessageData?.type === "agent_handover"
                ? (metadata.userMessage.agenticMessageData?.originMessageId ??
                  null)
                : null;

            results.push({
              agentMessageRow,
              messageRow,
              parentAgentMessageId,
              parentMessageId: metadata.userMessage.sId,
              configuration,
            });
          },
          {
            concurrency: 10,
          }
        );
      }
      break;
    default:
      assertNever(metadata);
  }

  return results.map(
    ({
      agentMessageRow,
      messageRow,
      parentMessageId,
      parentAgentMessageId,
      configuration,
    }) => ({
      row: agentMessageRow,
      m: {
        id: messageRow.id,
        agentMessageId: agentMessageRow.id,
        created: agentMessageRow.createdAt.getTime(),
        completedTs: agentMessageRow.completedAt?.getTime() ?? null,
        sId: messageRow.sId,
        type: "agent_message",
        visibility: "visible",
        version: messageRow.version,
        parentMessageId,
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
        modelInteractionDurationMs: agentMessageRow.modelInteractionDurationMs,
      } satisfies AgentMessageType,
    })
  );
};
