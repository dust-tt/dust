import type { Transaction } from "sequelize";

import { createConversation } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import type {
  ConversationVisibility,
  ConversationWithoutContentType,
  ModelId,
  SupportedContentFragmentType,
  UserMessageOrigin,
  UserMessageType,
  WorkspaceType,
} from "@app/types";

export class ConversationFactory {
  static async create(
    auth: Authenticator,
    {
      agentConfigurationId,
      messagesCreatedAt,
      conversationCreatedAt,
      requestedSpaceIds,
      visibility = "unlisted",
      t,
    }: {
      agentConfigurationId: string;
      messagesCreatedAt: Date[];
      conversationCreatedAt?: Date;
      requestedSpaceIds?: ModelId[];
      visibility?: ConversationVisibility;
      t?: Transaction;
    }
  ): Promise<ConversationWithoutContentType> {
    const user = auth.user();
    const workspace = auth.getNonNullableWorkspace();

    const conversation = await createConversation(auth, {
      title: "Test Conversation",
      visibility,
      spaceId: null,
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
      const userMessageRow = await createUserMessage({
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
        parentId: userMessageRow.id,
        t,
      });
    }

    return conversation;
  }

  /**
   * Creates a test user message
   */
  static async createUserMessage({
    auth,
    workspace,
    conversation,
    content,
    origin = "web",
    agenticMessageType,
    agenticOriginMessageId,
  }: {
    auth: Authenticator;
    workspace: WorkspaceType;
    conversation: ConversationWithoutContentType;
    content: string;
    origin?: UserMessageOrigin;
    agenticMessageType?: "run_agent" | "agent_handover";
    agenticOriginMessageId?: string;
  }): Promise<{ messageRow: MessageModel; userMessage: UserMessageType }> {
    const userMessageRow = await UserMessageModel.create({
      userId: auth.getNonNullableUser().id,
      workspaceId: workspace.id,
      content,
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: origin,
      clientSideMCPServerIds: [],
    });

    const messageRow = await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: userMessageRow.id,
      workspaceId: workspace.id,
    });

    const userMessage: UserMessageType = {
      id: messageRow.id,
      created: userMessageRow.createdAt.getTime(),
      sId: messageRow.sId,
      type: "user_message",
      visibility: messageRow.visibility,
      version: 0,
      user: auth.getNonNullableUser().toJSON(),
      mentions: [],
      richMentions: [],
      content: userMessageRow.content,
      context: {
        username: userMessageRow.userContextUsername,
        timezone: userMessageRow.userContextTimezone,
        fullName: userMessageRow.userContextFullName,
        email: userMessageRow.userContextEmail,
        profilePictureUrl: userMessageRow.userContextProfilePictureUrl,
        origin: userMessageRow.userContextOrigin,
      },
      ...(agenticMessageType &&
        agenticOriginMessageId && {
          agenticMessageData: {
            type: agenticMessageType,
            originMessageId: agenticOriginMessageId,
          },
        }),
      rank: messageRow.rank,
    };

    return { messageRow, userMessage };
  }

  /**
   * Creates a user message with a specific rank
   */
  static async createUserMessageWithRank({
    auth,
    workspace,
    conversationId,
    rank,
    content,
    origin = "web",
  }: {
    auth: Authenticator;
    workspace: WorkspaceType;
    conversationId: ModelId;
    rank: number;
    content: string;
    origin?: UserMessageOrigin;
  }): Promise<MessageModel> {
    const userMessageRow = await UserMessageModel.create({
      userId: auth.user()?.id,
      workspaceId: workspace.id,
      content,
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: origin,
      clientSideMCPServerIds: [],
    });

    return MessageModel.create({
      sId: generateRandomModelSId(),
      rank,
      conversationId,
      parentId: null,
      userMessageId: userMessageRow.id,
      workspaceId: workspace.id,
    });
  }

  /**
   * Creates an agent message with a specific rank
   */
  static async createAgentMessageWithRank({
    workspace,
    conversationId,
    rank,
    agentConfigurationId,
  }: {
    workspace: WorkspaceType;
    conversationId: ModelId;
    rank: number;
    agentConfigurationId: string;
  }): Promise<MessageModel> {
    const agentMessageRow = await AgentMessageModel.create({
      status: "created",
      agentConfigurationId,
      agentConfigurationVersion: 0,
      workspaceId: workspace.id,
      skipToolsValidation: false,
    });

    return MessageModel.create({
      sId: generateRandomModelSId(),
      rank,
      conversationId,
      parentId: null,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
    });
  }

  /**
   * Creates a content fragment message with a specific rank
   * If fileId is not provided, a file will be created automatically
   */
  static async createContentFragmentMessage({
    auth,
    workspace,
    conversationId,
    rank,
    fileId,
    title,
    contentType = "text/plain",
    fileName,
  }: {
    auth: Authenticator;
    workspace: WorkspaceType;
    conversationId: ModelId;
    rank: number;
    fileId?: ModelId;
    title: string;
    contentType?: SupportedContentFragmentType;
    fileName?: string;
  }): Promise<MessageModel> {
    let finalFileId = fileId;
    if (!finalFileId) {
      // Default to text/plain for file creation if contentType is not a valid file content type
      const fileContentType =
        contentType === "text/plain" || contentType === "text/markdown"
          ? contentType
          : "text/plain";
      const file = await FileFactory.create(
        workspace,
        auth.getNonNullableUser(),
        {
          contentType: fileContentType,
          fileName: fileName ?? `${title}.txt`,
          fileSize: 100,
          status: "ready",
          useCase: "conversation",
        }
      );
      finalFileId = file.id;
    }

    const contentFragment = await ContentFragmentResource.makeNew({
      workspaceId: workspace.id,
      title,
      contentType: contentType ?? "text/plain",
      fileId: finalFileId,
      userId: auth.getNonNullableUser().id,
      userContextUsername: "testuser",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      sourceUrl: null,
      textBytes: null,
    });

    return MessageModel.create({
      sId: generateRandomModelSId(),
      rank,
      conversationId,
      parentId: null,
      contentFragmentId: contentFragment.id,
      workspaceId: workspace.id,
    });
  }
}

const createUserMessage = async ({
  user,
  workspace,
  conversationModelId,
  createdAt,
  rank,
  t,
}: {
  user: UserResource | null;
  workspace: WorkspaceType;
  conversationModelId: ModelId;
  createdAt: Date;
  rank: number;
  t?: Transaction;
}): Promise<MessageModel> => {
  return MessageModel.create(
    {
      createdAt,
      updatedAt: createdAt,
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversationModelId,
      parentId: null,
      userMessageId: (
        await UserMessageModel.create(
          {
            createdAt,
            updatedAt: createdAt,
            userId: user?.id,
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
  parentId,
  t,
}: {
  workspace: WorkspaceType;
  conversationModelId: ModelId;
  agentConfigurationId: string;
  createdAt: Date;
  rank: number;
  parentId?: ModelId | null;
  t?: Transaction;
}) => {
  const agentMessageRow = await AgentMessageModel.create(
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
  const messageRow = await MessageModel.create(
    {
      createdAt,
      updatedAt: createdAt,
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversationModelId,
      parentId: parentId ?? null,
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
