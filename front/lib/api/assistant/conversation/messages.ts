import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { updateConversationRequirements } from "@app/lib/api/assistant/conversation/permissions";
import { getCompletionDuration } from "@app/lib/api/assistant/messages";
import { resolvedModelFromAgentMessageRow } from "@app/lib/api/assistant/models";
import { resolveModel } from "@app/lib/api/assistant/resolve_model";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessageModel,
  CompactionMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { UserResource } from "@app/lib/resources/user_resource";
import { isEmailValid } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  AgenticMessageData,
  AgentMessageType,
  CompactionMessageType,
  ConversationWithoutContentType,
  MessageVisibility,
  RichMentionWithStatus,
  UserMessageContext,
  UserMessageOrigin,
  UserMessageType,
  UserMessageTypeWithoutMentions,
} from "@app/types/assistant/conversation";
import type {
  ModelResolutionMethodType,
  ModelSelectionType,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType, WorkspaceType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

function signalAgentUsageAfterCommit(
  {
    agentConfigurationId,
    workspaceId,
  }: {
    agentConfigurationId: string;
    workspaceId: string;
  },
  transaction?: Transaction
) {
  const signal = () => {
    void signalAgentUsage({ agentConfigurationId, workspaceId }).catch(
      (err) => {
        logger.warn(
          { err: normalizeError(err), agentConfigurationId, workspaceId },
          "Failed to signal agent usage"
        );
      }
    );
  };

  if (transaction) {
    transaction.afterCommit(signal);
  } else {
    signal();
  }
}

export async function attributeUserFromWorkspaceAndEmail(
  workspace: WorkspaceType | null,
  email: string | null
): Promise<UserType | null> {
  if (!workspace || !email || !isEmailValid(email)) {
    return null;
  }

  const matchingUser = await UserResource.fetchByEmail(email);
  if (!matchingUser) {
    return null;
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: matchingUser,
      workspace,
    });

  return membership ? matchingUser.toJSON() : null;
}

export async function createUserMessage(
  auth: Authenticator,
  {
    conversation,
    metadata,
    content,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    content: string;
    metadata:
      | {
          type: "edit";
          message: UserMessageType;
        }
      | {
          type: "delete";
          message: UserMessageType;
        }
      | {
          type: "create";
          user: UserType | null;
          rank: number;
          context: UserMessageContext;
          agenticMessageData?: AgenticMessageData;
          visibility?: MessageVisibility;
          requestedModel: ModelSelectionType | null;
        };
    transaction: Transaction;
  }
): Promise<UserMessageTypeWithoutMentions> {
  const workspace = auth.getNonNullableWorkspace();
  let rank = 0;
  let version = 0;
  let parentId: ModelId | null = null;
  let user: UserType | null = null;

  let context: UserMessageContext | null = null;
  let agenticMessageData: AgenticMessageData | undefined = undefined;
  let visibility: MessageVisibility = "visible";
  let requestedModel: ModelSelectionType | null = null;

  switch (metadata.type) {
    case "edit":
      // In case of edit, we use the message metadata to create the updated user message.
      rank = metadata.message.rank;
      version = metadata.message.version + 1;
      parentId = metadata.message.id;
      user = metadata.message.user;

      context = metadata.message.context;
      agenticMessageData = metadata.message.agenticMessageData;
      requestedModel = metadata.message.requestedModel;
      break;
    case "delete":
      // See softDeleteUserMessageAndReplies for why a v+1 placeholder is used instead of an UPDATE.
      rank = metadata.message.rank;
      version = metadata.message.version + 1;
      parentId = metadata.message.id;
      user = metadata.message.user;

      context = metadata.message.context;
      agenticMessageData = metadata.message.agenticMessageData;
      visibility = "deleted";
      break;
    case "create":
      // Otherwise, we create a new user message from the metadata.
      rank = metadata.rank;
      user = metadata.user;
      context = metadata.context;
      agenticMessageData = metadata.agenticMessageData;
      requestedModel = metadata.requestedModel;
      if (metadata.visibility) {
        visibility = metadata.visibility;
      }
      break;
    default:
      assertNever(metadata);
  }

  // Fetch originMessage to ensure it exists and that it's an agent message.
  const originMessageId = agenticMessageData?.originMessageId;
  const originMessage = originMessageId
    ? await MessageModel.findOne({
        where: {
          workspaceId: workspace.id,
          sId: originMessageId,
          agentMessageId: { [Op.not]: null },
        },
        transaction,
      })
    : null;

  if (agenticMessageData?.originMessageId && !originMessage) {
    logger.warn(
      {
        originMessageId,
        workspaceId: workspace.id,
      },
      "Origin message not found"
    );
  }

  // An agent posts this message to answer the origin message, so it inherits the authorship of the
  // message the origin answers: nothing Dust posted on someone's behalf turns into a message of
  // theirs one run down. Keeps the whole tree off their personal credentials and out of approval
  // prompts nobody would answer.
  if (originMessage?.parentId) {
    const parentMessage = await MessageModel.findOne({
      attributes: ["userMessageId"],
      where: { workspaceId: workspace.id, id: originMessage.parentId },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          attributes: ["userId"],
        },
      ],
      transaction,
    });

    if (parentMessage?.userMessage?.userId === null) {
      user = null;
    }
  }

  // Only set agenticMessageType and agenticOriginMessageId if originMessage exists
  // The model validation requires both to be set together
  const agenticMessageType = originMessage ? agenticMessageData?.type : null;
  const agenticOriginMessageId = originMessage?.sId ?? null;
  const userMessage = await UserMessageModel.create(
    {
      content,
      // TODO(MCP Clean-up): Rename field in DB.
      clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
      userContextUsername: context.username,
      userContextTimezone: context.timezone,
      userContextFullName: context.fullName,
      userContextEmail: context.email,
      userContextProfilePictureUrl: context.profilePictureUrl,
      userContextOrigin: context.origin,
      userContextLastTriggerRunAt: context.lastTriggerRunAt
        ? new Date(context.lastTriggerRunAt)
        : null,
      userContextApiKeyId: context.apiKeyId ?? null,
      userContextAuthMethod: context.authMethod ?? null,
      agenticMessageType,
      agenticOriginMessageId,
      requestedModelId: requestedModel?.modelId ?? null,
      requestedProviderId: requestedModel?.providerId ?? null,
      requestedReasoningEffort: requestedModel?.reasoningEffort ?? null,
      userId: user?.id,
      conversationId: conversation.id,
      workspaceId: workspace.id,
    },
    { transaction }
  );

  const m = await MessageModel.create(
    {
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversation.id,
      parentId,
      version,
      userMessageId: userMessage.id,
      workspaceId: workspace.id,
      visibility,
    },
    {
      transaction,
    }
  );

  const createdUserMessage: UserMessageTypeWithoutMentions = {
    id: m.id,
    created: m.createdAt.getTime(),
    sId: m.sId,
    type: "user_message",
    visibility: m.visibility,
    version: m.version,
    user,
    content,
    context,
    agenticMessageData: agenticMessageData ?? undefined,
    rank: m.rank,
    branchId: null,
    reactions: [],
    requestedModel,
  };
  return createdUserMessage;
}

export interface AgentMessageModelResolution {
  resolvedModel: ResolvedRequestedModel;
  modelResolutionMethod: ModelResolutionMethodType;
}

export async function resolveModelForMentionedAgent(
  auth: Authenticator,
  {
    configuration,
    selection,
  }: {
    configuration: LightAgentConfigurationType;
    selection?: ModelSelectionType;
  }
): Promise<AgentMessageModelResolution> {
  const featureFlags = await getFeatureFlags(auth);

  // Sidekick picks its own model server-side. Never honor a user-supplied
  // model override for it
  let effectiveSelection = selection;
  if (configuration.sId === GLOBAL_AGENTS_SID.SIDEKICK && selection) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        userId: auth.user()?.sId,
        requestedProviderId: selection.providerId,
        requestedModelId: selection.modelId,
      },
      "Ignoring user model selection for the sidekick agent."
    );
    effectiveSelection = undefined;
  }

  return resolveModel(auth, {
    selection: effectiveSelection,
    configuration,
    featureFlags,
  });
}

export const createAgentMessages = async (
  auth: Authenticator,
  {
    conversation,
    metadata,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    metadata:
      | {
          type: "retry";
          agentMessage: AgentMessageType;
          agentMessageRow: AgentMessageModel;
          parentId: number;
        }
      | {
          type: "delete";
          agentMessage: AgentMessageType;
          parentId: number;
        }
      | {
          type: "create";
          agentConfiguration: LightAgentConfigurationType | null;
          skipToolsValidation: boolean;
          nextMessageRank: number;
          userMessage: UserMessageTypeWithoutMentions;
          modelResolution: AgentMessageModelResolution | null;
          isRestrictedBySpaceUsage: boolean;
        }
      | {
          type: "approve_existing_mention";
          mentionRow: MentionModel;
          configuration: LightAgentConfigurationType;
          skipToolsValidation: boolean;
          nextMessageRank: number;
          userMessage: UserMessageTypeWithoutMentions;
          modelResolution: AgentMessageModelResolution | null;
        };
    transaction?: Transaction;
  }
): Promise<{
  agentMessages: AgentMessageType[];
  richMentions: RichMentionWithStatus[];
}> => {
  const owner = auth.getNonNullableWorkspace();
  const results: {
    agentAnswer: {
      agentMessageRow: AgentMessageModel;
      messageRow: MessageModel;
    } | null;
    configuration: LightAgentConfigurationType;
    parentMessageId: string;
    parentAgentMessageId: string | null;
    mentionRow: MentionModel | null;
  }[] = [];

  switch (metadata.type) {
    case "retry":
      {
        const agentConfiguration = metadata.agentMessage.configuration;
        const agentMessageRow = await AgentMessageModel.create(
          {
            status: "created",
            agentConfigurationId: agentConfiguration.sId,
            agentConfigurationVersion: agentConfiguration.version,
            conversationId: conversation.id,
            workspaceId: owner.id,
            // Copy over the values from the original agent message row.
            skipToolsValidation: metadata.agentMessageRow.skipToolsValidation,
            resolvedProviderId: metadata.agentMessageRow.resolvedProviderId,
            resolvedModelId: metadata.agentMessageRow.resolvedModelId,
            resolvedReasoningEffort:
              metadata.agentMessageRow.resolvedReasoningEffort,
            modelResolutionMethod:
              metadata.agentMessageRow.modelResolutionMethod,
          },
          { transaction }
        );
        const messageRow = await MessageModel.create(
          {
            sId: generateRandomModelSId(),
            rank: metadata.agentMessage.rank,
            conversationId: conversation.id,
            parentId: metadata.parentId,
            version: metadata.agentMessage.version + 1,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
          },
          {
            transaction,
          }
        );

        // Track agent usage when retrying an agent message.
        signalAgentUsageAfterCommit(
          {
            agentConfigurationId: agentConfiguration.sId,
            workspaceId: owner.sId,
          },
          transaction
        );

        results.push({
          agentAnswer: {
            agentMessageRow,
            messageRow,
          },
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
          mentionRow: null,
        });
      }
      break;

    case "delete":
      {
        // See softDeleteUserMessageAndReplies / softDeleteAgentMessage for why a v+1 placeholder is used
        // instead of an UPDATE. MessageModel's exclusivity constraint forces us to anchor the v+1
        // row with a new AgentMessageModel (status "cancelled", it never ran).
        const agentConfiguration = metadata.agentMessage.configuration;
        const agentMessageRow = await AgentMessageModel.create(
          {
            status: "cancelled",
            agentConfigurationId: agentConfiguration.sId,
            agentConfigurationVersion: agentConfiguration.version,
            conversationId: conversation.id,
            workspaceId: owner.id,
            skipToolsValidation: metadata.agentMessage.skipToolsValidation,
          },
          { transaction }
        );
        const messageRow = await MessageModel.create(
          {
            sId: generateRandomModelSId(),
            rank: metadata.agentMessage.rank,
            conversationId: conversation.id,
            parentId: metadata.parentId,
            version: metadata.agentMessage.version + 1,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
            visibility: "deleted",
          },
          {
            transaction,
          }
        );

        results.push({
          agentAnswer: {
            agentMessageRow,
            messageRow,
          },
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
          mentionRow: null,
        });
      }
      break;

    case "approve_existing_mention":
      // Fall through into the shared create path after marking the existing
      // mention approved (do not insert a duplicate MentionModel row).
      await metadata.mentionRow.update({ status: "approved" }, { transaction });
    // falls through
    case "create":
      {
        const configuration =
          metadata.type === "approve_existing_mention"
            ? metadata.configuration
            : metadata.agentConfiguration;
        if (!configuration) {
          break;
        }

        let mentionRow: MentionModel;
        if (metadata.type === "approve_existing_mention") {
          mentionRow = metadata.mentionRow;
        } else {
          if (metadata.isRestrictedBySpaceUsage) {
            // This create the mentions from the original user message. Not to be mixed with
            // the mentions from the agent message (which will be filled later).
            const restrictedMentionRow = await MentionModel.create(
              {
                messageId: metadata.userMessage.id,
                agentConfigurationId: configuration.sId,
                workspaceId: owner.id,
                status: "agent_restricted_by_space_usage",
              },
              { transaction }
            );

            results.push({
              mentionRow: restrictedMentionRow,
              agentAnswer: null,
              parentMessageId: metadata.userMessage.sId,
              parentAgentMessageId: null,
              configuration,
            });

            break;
          }

          // This create the mentions from the original user message. Not to be mixed with the
          // mentions from the agent message (which will be filled later).
          mentionRow = await MentionModel.create(
            {
              messageId: metadata.userMessage.id,
              agentConfigurationId: configuration.sId,
              workspaceId: owner.id,
              status: "approved",
            },
            { transaction }
          );
        }

        const resolution = metadata.modelResolution;
        assert(
          resolution,
          `Missing model resolution for agent configuration ${configuration.sId}`
        );
        const { resolvedModel, modelResolutionMethod } = resolution;

        const agentMessageRow = await AgentMessageModel.create(
          {
            status: "created",
            agentConfigurationId: configuration.sId,
            agentConfigurationVersion: configuration.version,
            conversationId: conversation.id,
            workspaceId: owner.id,
            skipToolsValidation: metadata.skipToolsValidation,
            resolvedProviderId: resolvedModel.providerId,
            resolvedModelId: resolvedModel.modelId,
            resolvedReasoningEffort: resolvedModel.reasoningEffort,
            modelResolutionMethod,
          },
          { transaction }
        );
        const messageRow = await MessageModel.create(
          {
            sId: generateRandomModelSId(),
            rank: metadata.nextMessageRank,
            conversationId: conversation.id,
            parentId: metadata.userMessage.id,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
          },
          { transaction }
        );

        // This will tweak the UI a bit.
        const parentAgentMessageId =
          metadata.userMessage.agenticMessageData?.type === "agent_handover"
            ? metadata.userMessage.agenticMessageData.originMessageId
            : null;

        // Track agent usage when creating a new agent message.
        signalAgentUsageAfterCommit(
          {
            agentConfigurationId: configuration.sId,
            workspaceId: owner.sId,
          },
          transaction
        );

        results.push({
          agentAnswer: {
            agentMessageRow,
            messageRow,
          },
          parentAgentMessageId,
          parentMessageId: metadata.userMessage.sId,
          configuration,
          mentionRow,
        });
      }
      break;
    default:
      assertNever(metadata);
  }

  const agentMessages: AgentMessageType[] = removeNulls(
    results.map(
      ({
        agentAnswer,
        parentMessageId,
        parentAgentMessageId,
        configuration,
      }) => {
        if (agentAnswer) {
          const { agentMessageRow, messageRow } = agentAnswer;
          return {
            id: messageRow.id,
            agentMessageId: agentMessageRow.id,
            created: agentMessageRow.createdAt.getTime(),
            completedTs: agentMessageRow.completedAt?.getTime() ?? null,
            sId: messageRow.sId,
            type: "agent_message",
            visibility: messageRow.visibility,
            version: messageRow.version,
            parentMessageId,
            parentAgentMessageId,
            status: agentMessageRow.status,
            actions: [],
            content: null,
            chainOfThought: null,
            rawContents: [],
            error: null,
            configuration,
            rank: messageRow.rank,
            branchId: null,
            skipToolsValidation: agentMessageRow.skipToolsValidation,
            contents: [],
            parsedContents: {},
            modelInteractionDurationMs:
              agentMessageRow.modelInteractionDurationMs,
            completionDurationMs: getCompletionDuration(
              agentMessageRow.createdAt.getTime(),
              agentMessageRow.completedAt?.getTime() ?? null,
              []
            ),
            richMentions: [],
            reactions: [],
            costCredits: null,
            resolvedModel: resolvedModelFromAgentMessageRow(agentMessageRow),
            modelResolutionMethod: agentMessageRow.modelResolutionMethod,
          };
        }
      }
    )
  );

  const richMentions: RichMentionWithStatus[] = removeNulls(
    results.map(({ mentionRow, configuration }) => {
      if (mentionRow) {
        return {
          type: "agent",
          id: configuration.sId,
          label: configuration.name,
          status: mentionRow.status,
          pictureUrl: configuration.pictureUrl,
          description: configuration.description,
          dismissed: mentionRow.dismissed ?? false,
        };
      }
    })
  );

  await updateConversationRequirements(auth, {
    agents: agentMessages.map((m) => m.configuration),
    conversation,
    t: transaction,
  });

  return { agentMessages, richMentions };
};

export async function getUserMessageIdFromMessageId(
  auth: Authenticator,
  { messageId }: { messageId: string }
): Promise<{
  agentMessageId: string;
  agentMessageVersion: number;
  userMessageId: string;
  userMessageVersion: number;
  userMessageUserId: number | null;
  userMessageOrigin: UserMessageOrigin;
}> {
  // Query 1: Get the message and its parentId.
  const agentMessage = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: messageId,
      agentMessageId: { [Op.ne]: null },
    },
    attributes: ["parentId", "version", "sId", "workspaceId"],
  });

  assert(
    agentMessage?.parentId,
    "Agent message is expected to have a parentId"
  );

  // Query 2: Get the parent message's sId (which is the user message).
  const parentMessage = await MessageModel.findOne({
    where: {
      id: agentMessage.parentId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["sId", "version"],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
        attributes: ["userId", "userContextOrigin"],
      },
    ],
  });

  assert(
    parentMessage && parentMessage.userMessage,
    "A user message is expected for the agent message's parent"
  );

  return {
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
    userMessageUserId: parentMessage.userMessage.userId,
    userMessageOrigin: parentMessage.userMessage.userContextOrigin,
  };
}

export async function createCompactionMessage(
  auth: Authenticator,
  {
    conversation,
    rank,
    sourceConversationId,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    sourceConversationId?: string;
    transaction: Transaction;
  }
): Promise<CompactionMessageType> {
  const workspace = auth.getNonNullableWorkspace();

  const compactionMessageRow = await CompactionMessageModel.create(
    {
      status: "created",
      content: null,
      runIds: null,
      sourceConversationId: sourceConversationId ?? null,
      conversationId: conversation.id,
      workspaceId: workspace.id,
    },
    { transaction }
  );

  const messageRow = await MessageModel.create(
    {
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversation.id,
      version: 0,
      compactionMessageId: compactionMessageRow.id,
      workspaceId: workspace.id,
    },
    { transaction }
  );

  return {
    type: "compaction_message",
    id: messageRow.id,
    compactionMessageId: compactionMessageRow.id,
    sId: messageRow.sId,
    created: messageRow.createdAt.getTime(),
    visibility: messageRow.visibility,
    version: messageRow.version,
    rank: messageRow.rank,
    branchId: null,
    status: "created",
    content: null,
    ...(sourceConversationId ? { sourceConversationId } : {}),
  };
}
