import type { Transaction } from "sequelize";

import { createConversation } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ConversationType, ModelId, WorkspaceType } from "@app/types";

export class ConversationFactory {
  static async create(
    auth: Authenticator,
    {
      agentConfigurationId,
      messagesCreatedAt,
      conversationCreatedAt,
      requestedSpaceIds,
      t,
    }: {
      agentConfigurationId: string;
      messagesCreatedAt: Date[];
      conversationCreatedAt?: Date;
      requestedSpaceIds?: ModelId[];
      t?: Transaction;
    }
  ): Promise<ConversationType> {
    const user = auth.getNonNullableUser();
    const workspace = auth.getNonNullableWorkspace();

    const conversation = await createConversation(auth, {
      title: "Test Conversation",
      visibility: "unlisted",
    });

    if (conversationCreatedAt) {
      await ConversationModel.update(
        { createdAt: conversationCreatedAt },
        { where: { id: conversation.id } }
      );
    }

    if (requestedSpaceIds && requestedSpaceIds.length > 0) {
      await ConversationModel.update(
        { requestedSpaceIds },
        { where: { id: conversation.id } }
      );
    }

    // Note: fetchConversationParticipants rely on the existence of UserMessage even if we have a table for ConversationParticipant.
    for (let i = 0; i < messagesCreatedAt.length; i++) {
      const createdAt = messagesCreatedAt[i];
      await createMessageAndUserMessage({
        user,
        workspace,
        conversationModelId: conversation.id,
        createdAt,
        rank: i * 2,
        t,
      });
      await createMessageAndAgentMessage({
        workspace,
        conversationModelId: conversation.id,
        agentConfigurationId,
        createdAt,
        rank: i * 2 + 1,
        t,
      });
    }

    return conversation;
  }
}

const createMessageAndUserMessage = async ({
  user,
  workspace,
  conversationModelId,
  createdAt,
  rank,
  t,
}: {
  user: UserResource;
  workspace: WorkspaceType;
  conversationModelId: ModelId;
  createdAt: Date;
  rank: number;
  t?: Transaction;
}) => {
  return Message.create(
    {
      createdAt,
      updatedAt: createdAt,
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversationModelId,
      parentId: null,
      userMessageId: (
        await UserMessage.create(
          {
            createdAt,
            updatedAt: createdAt,
            userId: user.id,
            workspaceId: workspace.id,
            content: "Test user Message.",
            userContextUsername: "soupinou",
            userContextTimezone: "Europe/Paris",
            userContextFullName: "Soupinou",
            userContextEmail: "soupinou@dust.tt",
            userContextProfilePictureUrl: "https://dust.tt/soupinou",
            userContextOrigin: "web",
            clientSideMCPServerIds: [], // TODO(MCP Clean-up): Rename field in DB.
          },
          { transaction: t }
        )
      ).id,
      workspaceId: workspace.id,
    },
    {
      transaction: t,
    }
  );
};

const createMessageAndAgentMessage = async ({
  workspace,
  conversationModelId,
  agentConfigurationId,
  createdAt,
  rank,
  t,
}: {
  workspace: WorkspaceType;
  conversationModelId: ModelId;
  agentConfigurationId: string;
  createdAt: Date;
  rank: number;
  t?: Transaction;
}) => {
  const agentMessageRow = await AgentMessage.create(
    {
      createdAt,
      updatedAt: createdAt,
      status: "created",
      agentConfigurationId,
      agentConfigurationVersion: 0,
      workspaceId: workspace.id,
      skipToolsValidation: false,
    },
    { transaction: t }
  );
  const messageRow = await Message.create(
    {
      createdAt,
      updatedAt: createdAt,
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversationModelId,
      parentId: null,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
    },
    {
      transaction: t,
    }
  );
  return {
    agentMessageRow,
    messageRow,
  };
};
