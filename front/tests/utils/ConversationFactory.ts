import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageStatus,
  AgentMessageType,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  UserMessageOrigin,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type {
  ModelResolutionMethodType,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import type { SupportedContentFragmentType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

async function authForConversationFetch(
  auth: Authenticator,
  t?: Transaction
): Promise<Authenticator> {
  if (auth.isUser()) {
    return auth;
  }

  const user = auth.user();
  if (!user) {
    return auth;
  }

  const workspace = auth.getNonNullableWorkspace();
  const role = await MembershipResource.getActiveRoleForUserInWorkspace({
    user,
    workspace,
    transaction: t,
  });

  if (role === "none") {
    await MembershipFactory.associate(workspace, user, { role: "user" }, t);
  }

  return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId, {
    transaction: t,
  });
}

async function resolveAgentConfigurationId(
  auth: Authenticator,
  agentConfigurationId: string,
  t?: Transaction
): Promise<string> {
  const fetchAuth = await authForConversationFetch(auth, t);
  const existing = await getAgentConfiguration(fetchAuth, {
    agentId: agentConfigurationId,
    variant: "extra_light",
  });
  if (existing) {
    return agentConfigurationId;
  }

  const agent = await AgentConfigurationFactory.createTestAgent(fetchAuth);
  return agent.sId;
}

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
      depth,
      triggerId,
      t,
    }: {
      agentConfigurationId: string;
      messagesCreatedAt: Date[];
      conversationCreatedAt?: Date;
      requestedSpaceIds?: ModelId[];
      spaceId?: ModelId;
      visibility?: ConversationVisibility;
      depth?: number;
      triggerId?: ModelId | null;
      t?: Transaction;
    }
  ): Promise<ConversationType> {
    const user = auth.user();
    const workspace = auth.getNonNullableWorkspace();

    const conversation = await createConversation(auth, {
      title: "Test Conversation",
      visibility,
      depth,
      triggerId,
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

    const resolvedAgentConfigurationId =
      messagesCreatedAt.length > 0
        ? await resolveAgentConfigurationId(auth, agentConfigurationId, t)
        : agentConfigurationId;

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
        agentConfigurationId: resolvedAgentConfigurationId,
        createdAt,
        rank: i * 2 + 1,
        parentId: userMessageRow.id,
        t,
      });
    }

    const fetchAuth = await authForConversationFetch(auth, t);
    const res = await getConversation(
      fetchAuth,
      conversation.sId,
      visibility === "deleted"
    );
    if (res.isErr()) {
      throw new Error(`Failed to fetch conversation: ${res.error.type}`);
    }
    return res.value;
  }

  static async setTriggerIdForTest(
    conversationId: ModelId,
    workspaceId: ModelId,
    triggerId: ModelId
  ): Promise<void> {
    await ConversationModel.update(
      { triggerId },
      { where: { id: conversationId, workspaceId } }
    );
  }

  static async setUpdatedAtForTest(
    auth: Authenticator,
    conversationId: ModelId,
    updatedAt: Date
  ): Promise<void> {
    // Sequelize's `silent: true` suppresses both the automatic updatedAt and any
    // explicitly-provided value for managed timestamp fields, so the column never
    // gets updated. Raw SQL is the only reliable way to backdate timestamps in tests.
    // biome-ignore lint/plugin/noRawSql: see comment above
    await frontSequelize.query(
      `UPDATE conversations SET "updatedAt" = :updatedAt WHERE id = :id AND "workspaceId" = :workspaceId`,
      {
        replacements: {
          updatedAt: updatedAt.toISOString(),
          id: conversationId,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );
  }

  static async createFunctionCallStepForTest(
    auth: Authenticator,
    agentMessageId: ModelId,
    { createdAt }: { createdAt: Date }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const step = await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId,
      step: 0,
      index: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: generateRandomModelSId(),
          name: "test_tool",
          arguments: "{}",
        },
      },
    });
    // biome-ignore lint/plugin/noRawSql: Raw SQL is the only reliable way to backdate timestamps in tests.
    await frontSequelize.query(
      `UPDATE agent_step_contents SET "createdAt" = :createdAt, "updatedAt" = :createdAt WHERE id = :id AND "workspaceId" = :workspaceId`,
      {
        replacements: {
          createdAt: createdAt.toISOString(),
          id: step.id,
          workspaceId,
        },
      }
    );
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
    rank = 0,
    createdAt,
    agenticMessageType,
    agenticOriginMessageId,
    authorless = false,
    clientSideMCPServerIds = [],
    requestedModel = null,
  }: {
    auth: Authenticator;
    workspace: WorkspaceType;
    conversation: ConversationWithoutContentType | ConversationResource;
    content: string;
    origin?: UserMessageOrigin;
    rank?: number;
    createdAt?: Date;
    // Posted by Dust on the user's behalf, so no author on the row.
    authorless?: boolean;
    agenticMessageType?: "run_agent" | "agent_handover";
    agenticOriginMessageId?: string;
    clientSideMCPServerIds?: string[];
    requestedModel?: ResolvedRequestedModel | null;
  }): Promise<{ messageRow: MessageModel; userMessage: UserMessageType }> {
    const userMessageRow = await UserMessageModel.create({
      userId: authorless ? null : auth.getNonNullableUser().id,
      conversationId: conversation.id,
      workspaceId: workspace.id,
      content,
      userContextUsername: "testuser",
      userContextTimezone: "UTC",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      userContextOrigin: origin,
      clientSideMCPServerIds,
      agenticMessageType: agenticMessageType ?? null,
      agenticOriginMessageId: agenticOriginMessageId ?? null,
      requestedProviderId: requestedModel?.providerId ?? null,
      requestedModelId: requestedModel?.modelId ?? null,
      requestedReasoningEffort: requestedModel?.reasoningEffort ?? null,
    });

    const messageRow = await MessageModel.create({
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: userMessageRow.id,
      workspaceId: workspace.id,
      ...(createdAt ? { createdAt } : {}),
    });

    const userMessage: UserMessageType = {
      id: messageRow.id,
      created: userMessageRow.createdAt.getTime(),
      sId: messageRow.sId,
      type: "user_message",
      visibility: messageRow.visibility,
      version: 0,
      branchId: null,
      user: authorless ? null : auth.getNonNullableUser().toJSON(),
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
      requestedModel,
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
      conversationId,
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
    agentConfigurationVersion = 0,
    parentId = null,
    version = 0,
    resolvedModel = null,
    modelResolutionMethod = null,
    runIds = null,
  }: {
    workspace: WorkspaceType;
    conversationId: ModelId;
    rank: number;
    agentConfigurationId: string;
    agentConfigurationVersion?: number;
    parentId?: ModelId | null;
    version?: number;
    resolvedModel?: ResolvedRequestedModel | null;
    modelResolutionMethod?: ModelResolutionMethodType | null;
    runIds?: string[] | null;
  }): Promise<MessageModel> {
    const agentMessageRow = await AgentMessageModel.create({
      status: "created",
      agentConfigurationId,
      agentConfigurationVersion,
      conversationId,
      workspaceId: workspace.id,
      skipToolsValidation: false,
      resolvedProviderId: resolvedModel?.providerId ?? null,
      resolvedModelId: resolvedModel?.modelId ?? null,
      resolvedReasoningEffort: resolvedModel?.reasoningEffort ?? null,
      modelResolutionMethod,
      runIds,
    });

    return MessageModel.create({
      sId: generateRandomModelSId(),
      rank,
      version,
      conversationId,
      parentId,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
    });
  }

  /**
   * Sets the status of an agent message, e.g. to simulate a message that was interrupted.
   */
  static async setAgentMessageStatus({
    workspace,
    agentMessageModelId,
    status,
  }: {
    workspace: WorkspaceType;
    agentMessageModelId: ModelId;
    status: AgentMessageStatus;
  }): Promise<void> {
    await AgentMessageModel.update(
      { status },
      { where: { id: agentMessageModelId, workspaceId: workspace.id } }
    );
  }

  /**
   * Creates a test agent message with full type information.
   * Optionally creates an MCP action (with its step content) when `mcpAction` is provided.
   */
  static async createAgentMessage(
    auth: Authenticator,
    {
      workspace,
      conversation,
      agentConfig,
      parentMessageModelId = null,
      rank = 0,
      mcpAction,
      runIds = null,
    }: {
      workspace: WorkspaceType;
      conversation:
        | ConversationType
        | ConversationWithoutContentType
        | ConversationResource;
      agentConfig: LightAgentConfigurationType;
      parentMessageModelId?: ModelId | null;
      rank?: number;
      mcpAction?: {
        toolConfiguration: LightServerSideMCPToolConfigurationType;
        status?: ToolExecutionStatus;
        augmentedInputs?: Record<string, unknown>;
      };
      runIds?: string[] | null;
    }
  ): Promise<{
    messageRow: MessageModel;
    agentMessage: AgentMessageType;
    action?: AgentMCPActionResource;
  }> {
    const agentMessageRow = await AgentMessageModel.create({
      status: "created",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      conversationId: conversation.id,
      workspaceId: workspace.id,
      skipToolsValidation: false,
      runIds,
    });

    const messageRow = await MessageModel.create({
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversation.id,
      parentId: parentMessageModelId,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
    });

    const agentMessage: AgentMessageType = {
      id: messageRow.id,
      agentMessageId: agentMessageRow.id,
      created: agentMessageRow.createdAt.getTime(),
      completedTs: null,
      sId: messageRow.sId,
      type: "agent_message",
      visibility: messageRow.visibility,
      version: messageRow.version,
      branchId: null,
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
      richMentions: [],
      costCredits: null,
      resolvedModel: null,
      modelResolutionMethod: null,
    };

    if (!mcpAction) {
      return { messageRow, agentMessage };
    }

    const {
      toolConfiguration,
      status = "running",
      augmentedInputs = {},
    } = mcpAction;

    const stepContent = await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.agentMessageId,
      step: 0,
      index: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          name: toolConfiguration.name,
          arguments: JSON.stringify(augmentedInputs),
          id: generateRandomModelSId(),
        },
      },
    });

    const action = await AgentMCPActionResource.makeNew(
      auth,
      { conversation, stepContent },
      {
        agentMessageId: agentMessage.agentMessageId,
        augmentedInputs,
        citationsAllocated: 0,
        mcpServerConfigurationId: toolConfiguration.sId,
        status,
        stepContext: {
          citationsCount: 0,
          citationsOffset: 0,
          resumeState: null,
          retrievalTopK: 0,
          websearchResultCount: 0,
        },
        toolConfiguration,
      }
    );

    return { messageRow, agentMessage, action };
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
      const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
        contentType: fileContentType,
        fileName: fileName ?? `${title}.txt`,
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
      });
      finalFileId = file.id;
    }

    const contentFragment = await ContentFragmentResource.makeNew({
      workspaceId: workspace.id,
      conversationId,
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
            conversationId: conversationModelId,
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
      conversationId: conversationModelId,
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
