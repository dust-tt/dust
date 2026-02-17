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
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageTypeWithoutMentions,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  UserMessageOrigin,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { SupportedContentFragmentType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

export class ConversationFactory {
  static async create(
    auth: Authenticator,
    {
      agentConfigurationId,
      messagesCreatedAt,
      conversationCreatedAt,
      requestedSpaceIds,
      spaceId,
      visibility = "unlisted",
      t,
    }: {
      agentConfigurationId: string;
      messagesCreatedAt: Date[];
      conversationCreatedAt?: Date;
      requestedSpaceIds?: ModelId[];
      spaceId?: ModelId;
      visibility?: ConversationVisibility;
      t?: Transaction;
    }
  ): Promise<ConversationType> {
    const user = auth.user();
    const workspace = auth.getNonNullableWorkspace();

    const conversation = await createConversation(auth, {
      title: "Test Conversation",
      visibility,
      spaceId: spaceId ?? null,
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
      reactions: [],
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
   * Creates a test agent message with full type information
   */
  static async createAgentMessage({
    workspace,
    conversation,
    agentConfig,
  }: {
    workspace: WorkspaceType;
    conversation: ConversationType | ConversationWithoutContentType;
    agentConfig: LightAgentConfigurationType;
  }): Promise<{
    messageRow: MessageModel;
    agentMessage: AgentMessageTypeWithoutMentions;
  }> {
    const agentMessageRow = await AgentMessageModel.create({
      status: "created",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      workspaceId: workspace.id,
      skipToolsValidation: false,
    });

    const messageRow = await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
    });

    const agentMessage: AgentMessageTypeWithoutMentions = {
      id: messageRow.id,
      agentMessageId: agentMessageRow.id,
      created: agentMessageRow.createdAt.getTime(),
      completedTs: null,
      sId: messageRow.sId,
      type: "agent_message",
      visibility: messageRow.visibility,
      version: messageRow.version,
      parentMessageId: "",
      parentAgentMessageId: null,
      status: agentMessageRow.status,
      content: null,
      chainOfThought: null,
      error: null,
      configuration: agentConfig,
      skipToolsValidation: false,
      actions: [],
      contents: [],
      reactions: [],
      modelInteractionDurationMs: null,
      completionDurationMs: null,
      rank: messageRow.rank,
    };

    return { messageRow, agentMessage };
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

  static async getMessage(auth: Authenticator, messageId: ModelId) {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const message = await MessageModel.findOne({
      where: { id: messageId, workspaceId },
    });

    let userMessage: UserMessageModel | null = null;
    if (message?.userMessageId) {
      userMessage = await UserMessageModel.findOne({
        where: {
          id: message.userMessageId,
          workspaceId,
        },
      });
    }

    let agentMessage: AgentMessageModel | null = null;
    if (message?.agentMessageId) {
      agentMessage = await AgentMessageModel.findOne({
        where: {
          id: message.agentMessageId,
          workspaceId,
        },
      });
    }

    return { agentMessage, message, userMessage };
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
