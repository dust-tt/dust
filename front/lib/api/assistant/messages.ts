import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getMessagesReactions } from "@app/lib/api/assistant/reaction";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageContentParser,
  getCoTDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  LegacyLightMessageType,
  LightAgentMessageType,
  LightMessageType,
  MessageType,
  RichMentionWithStatus,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  ConversationError,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import {
  toMentionType,
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types/assistant/mentions";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";

export function getCompletionDuration(
  created: number,
  completedTs: number | null,
  actions: AgentMCPActionWithOutputType[]
) {
  if (!completedTs) {
    return null;
  }

  // Assumption: Each action has two phases: wait period, then execution period
  // Action timeline: [createdAt] ----wait---- [executionStart] ----execute---- [updatedAt]
  // Where executionStart = updatedAt - executionDurationMs
  //
  // Message timeline: [created] ---blank---[action 1] --- blank --- [action 2] --- blank --- [completedTs]

  const waitRanges: Array<{ start: number; end: number }> = actions
    .filter((a) => a.executionDurationMs !== null)
    .map((a) => ({
      start: a.createdAt,
      end: a.updatedAt - a.executionDurationMs!,
    }))
    .filter((r) => r.end > r.start) // Filter out actions with no wait time
    .sort((a, b) => a.start - b.start);

  if (waitRanges.length === 0) {
    return completedTs - created;
  }

  // Merge overlapping wait periods
  const mergedWaitRanges: Array<{ start: number; end: number }> = [];
  let currentRange = waitRanges[0];

  for (let i = 1; i < waitRanges.length; i++) {
    const range = waitRanges[i];
    if (range.start <= currentRange.end) {
      // Overlapping or adjacent - merge by extending the end
      currentRange = {
        start: currentRange.start,
        end: Math.max(currentRange.end, range.end),
      };
    } else {
      // Non-overlapping - save current and start new range
      mergedWaitRanges.push(currentRange);
      currentRange = range;
    }
  }
  mergedWaitRanges.push(currentRange);

  // Calculate total wait time
  const totalWaitTimeMs = mergedWaitRanges.reduce(
    (sum, range) => sum + (range.end - range.start),
    0
  );

  return completedTs - created - totalWaitTimeMs;
}

export function getRichMentionsWithStatusForMessage(
  messageId: ModelId,
  mentionRows: MentionModel[],
  usersById: Map<ModelId, UserType>,
  agentConfigurationsById: Map<string, LightAgentConfigurationType>
): RichMentionWithStatus[] {
  return removeNulls(
    mentionRows
      // Keep only the mentions for the current message.
      .filter((m) => m.messageId === messageId)
      // Map the mentions to rich mentions.
      .map((m) => {
        if (m.agentConfigurationId) {
          const agentConfiguration = agentConfigurationsById.get(
            m.agentConfigurationId
          );
          if (agentConfiguration) {
            return {
              ...toRichAgentMentionType(agentConfiguration),
              status: m.status,
              dismissed: m.dismissed ?? false,
            };
          }
        } else if (m.userId) {
          const mentionedUser = usersById.get(m.userId);
          if (mentionedUser) {
            return {
              ...toRichUserMentionType(mentionedUser),
              status: m.status,
              dismissed: m.dismissed ?? false,
            };
          }
        } else {
          throw new Error(
            "Unreachable: Mention type not supported, it must either be an agent mention or a user mention"
          );
        }
      })
  );
}

// Ensure at least one whitespace boundary between adjacent text fragments when
// reconstructing content from step contents. If neither the previous fragment
// ends with whitespace nor the next fragment starts with whitespace, insert a
// single "\n" between them. This avoids words being concatenated across step
// boundaries without altering content that already contains spacing.
function interleaveConditionalNewlines(parts: string[]): string[] {
  if (parts.length === 0) {
    return [];
  }
  const out: string[] = [];
  out.push(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1];
    const curr = parts[i];
    const prevLast = prev.length ? prev[prev.length - 1] : "";
    const currFirst = curr.length ? curr[0] : "";
    const prevEndsWs = /\s/.test(prevLast);
    const currStartsWs = /\s/.test(currFirst);
    if (!prevEndsWs && !currStartsWs) {
      out.push("\n");
    }
    out.push(curr);
  }
  return out;
}

async function batchRenderUserMessages(
  auth: Authenticator,
  messages: MessageModel[]
): Promise<UserMessageType[]> {
  const userMessages = messages.filter(
    (m) => m.userMessage !== null && m.userMessage !== undefined
  );

  const mentionRows = await MentionModel.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      messageId: userMessages.map((m) => m.id),
    },
  });

  const userIds = [
    ...new Set(
      removeNulls([
        ...userMessages.map((m) => m.userMessage?.userId),
        ...mentionRows.map((m) => m.userId),
      ])
    ),
  ];

  const agentConfigurationSIds = [
    ...new Set(
      removeNulls([...mentionRows.map((m) => m.agentConfigurationId)])
    ),
  ];

  const [users, agentConfigurations] = await Promise.all([
    userIds.length > 0 ? UserResource.fetchByModelIds(userIds) : [],
    agentConfigurationSIds.length > 0
      ? getAgentConfigurations(auth, {
          agentIds: agentConfigurationSIds,
          variant: "extra_light",
        })
      : [],
  ]);

  const usersById = new Map(users.map((u) => [u.id, u.toJSON()]));
  const agentConfigurationsById = new Map(
    agentConfigurations.map((a) => [a.sId, a])
  );

  const reactionsByMessageId = await getMessagesReactions(auth, {
    messageIds: userMessages.map((m) => m.id),
  });

  return userMessages.map((message) => {
    if (!message.userMessage) {
      throw new Error(
        "Unreachable: batchRenderUserMessages has been filtered on user messages"
      );
    }
    const userMessage = message.userMessage;
    const user = userMessage.userId ? usersById.get(userMessage.userId) : null;

    const richMentions = getRichMentionsWithStatusForMessage(
      message.id,
      mentionRows,
      usersById,
      agentConfigurationsById
    );
    let username = userMessage.userContextUsername;
    let fullName = userMessage.userContextFullName;
    let email = userMessage.userContextEmail;
    let profilePictureUrl = userMessage.userContextProfilePictureUrl;

    // We have a linked user and this is not an agentic message, so we can override the user context with the latest user data.
    if (userMessage.userId !== null && !userMessage.agenticMessageType) {
      const user = usersById.get(userMessage.userId);
      if (user) {
        username = user.username;
        fullName = user.fullName;
        email = user.email;
        profilePictureUrl = user.image;
      } else {
        logger.warn(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            conversationSId: message.sId,
            userId: userMessage.userId,
          },
          "User not found for user message while it should have been fetched before. Falling back to user context."
        );
      }
    }

    const mentions = richMentions.map(toMentionType);
    return {
      id: message.id,
      sId: message.sId,
      type: "user_message",
      visibility: message.visibility,
      version: message.version,
      rank: message.rank,
      created: message.createdAt.getTime(),
      user: user ?? null,
      mentions,
      richMentions,
      content: userMessage.content,
      context: {
        username,
        timezone: userMessage.userContextTimezone,
        fullName,
        email,
        profilePictureUrl,
        origin: userMessage.userContextOrigin,
        clientSideMCPServerIds: userMessage.clientSideMCPServerIds,
        lastTriggerRunAt:
          userMessage.userContextLastTriggerRunAt?.getTime() ?? null,
      },
      agenticMessageData:
        userMessage.agenticMessageType && userMessage.agenticOriginMessageId
          ? {
              type: userMessage.agenticMessageType,
              originMessageId: userMessage.agenticOriginMessageId,
            }
          : undefined,
      reactions: reactionsByMessageId[message.id] ?? [],
    } satisfies UserMessageType;
  });
}

async function batchRenderAgentMessages<V extends RenderMessageVariant>(
  auth: Authenticator,
  messages: MessageModel[],
  viewType: V
): Promise<
  Result<
    V extends "full" ? AgentMessageType[] : LightAgentMessageType[],
    ConversationError
  >
> {
  const agentMessages = messages.filter((m) => !!m.agentMessage);
  const agentMessageIds = removeNulls(
    agentMessages.map((m) => m.agentMessageId ?? null)
  );

  const mentionRows = await MentionModel.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      messageId: agentMessages.map((m) => m.id),
    },
  });

  const userIds = [
    ...new Set(removeNulls([...mentionRows.map((m) => m.userId)])),
  ];

  // Get all unique pairs id-version for the agent configurations
  const agentConfigurationIds = [
    ...new Set(
      removeNulls([...mentionRows.map((m) => m.agentConfigurationId)])
    ),
    ...agentMessages.reduce((acc, m) => {
      if (m.agentMessage) {
        acc.add(m.agentMessage.agentConfigurationId);
      }
      return acc;
    }, new Set<string>()),
  ];

  const [users, agentConfigurations] = await Promise.all([
    userIds.length > 0 ? UserResource.fetchByModelIds(userIds) : [],
    agentConfigurationIds.length > 0
      ? getAgentConfigurations(auth, {
          agentIds: [...agentConfigurationIds],
          variant: "extra_light_with_instructions",
        })
      : [],
  ]);

  const usersById = new Map(users.map((u) => [u.id, u.toJSON()]));
  const agentConfigurationsById = new Map(
    agentConfigurations.map((a) => [a.sId, a])
  );

  const stepContents = await AgentStepContentResource.fetchByAgentMessages(
    auth,
    {
      agentMessageIds,
      latestVersionsOnly: true,
    }
  );

  if (!agentConfigurations) {
    return new Err(
      new ConversationError("conversation_with_unavailable_agent")
    );
  }

  const agentMCPActions = await AgentMCPActionResource.fetchByStepContents(
    auth,
    {
      stepContents,
      latestVersionsOnly: true,
    }
  );
  const actionsWithOutputs =
    await AgentMCPActionResource.enrichActionsWithOutputItems(
      auth,
      agentMCPActions
    );

  const stepContentsByMessageId: Record<string, AgentStepContentResource[]> =
    stepContents.reduce(
      (acc, sc) => {
        if (!acc[sc.agentMessageId]) {
          acc[sc.agentMessageId] = [];
        }
        acc[sc.agentMessageId].push(sc);
        return acc;
      },
      {} as Record<string, AgentStepContentResource[]>
    );

  // Create maps for efficient lookups
  const messagesBySId = new Map(messages.map((m) => [m.sId, m]));
  const messagesById = new Map(messages.map((m) => [m.id, m]));

  const reactionsByMessageId = await getMessagesReactions(auth, {
    messageIds: agentMessages.map((m) => m.id),
  });

  // The only async part here is the content parsing, but it's "fake async" as the content parsing is not doing
  // any IO or network. We need it to be async as we want to re-use the async generators for the content parsing.
  const renderedMessages = await Promise.all(
    agentMessages.map(async (message) => {
      if (!message.agentMessage) {
        throw new Error(
          "Unreachable: batchRenderAgentMessages has been filtered on agent message"
        );
      }
      const agentMessage = message.agentMessage;

      const actions = actionsWithOutputs
        .filter((a) => a.agentMessageId === agentMessage.id)
        .sort((a, b) => a.step - b.step);

      const agentConfiguration = agentConfigurationsById.get(
        agentMessage.agentConfigurationId
      );
      if (!agentConfiguration) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            conversationSId: message.sId,
            agentMessageId: agentMessage.id,
            agentConfigurationId: agentMessage.agentConfigurationId,
            agentConfigurations,
          },
          "Conversation with unavailable agents"
        );

        return new Err(
          new ConversationError("conversation_with_unavailable_agent")
        );
      }

      let error: {
        code: string;
        message: string;
        metadata: Record<string, string | number | boolean> | null;
      } | null = null;

      if (
        agentMessage.errorCode !== null &&
        agentMessage.errorMessage !== null
      ) {
        error = {
          code: agentMessage.errorCode,
          message: agentMessage.errorMessage,
          metadata: agentMessage.errorMetadata,
        };
      }

      const agentStepContents =
        stepContentsByMessageId[agentMessage.id]
          ?.sort((a, b) => a.step - b.step || a.index - b.index)
          .map((sc) => ({
            step: sc.step,
            content: sc.value,
          })) ?? [];

      const textContents: Array<{
        step: number;
        content: AgentTextContentType;
      }> = [];
      for (const content of agentStepContents) {
        if (content.content.type === "text_content") {
          textContents.push({ step: content.step, content: content.content });
        }
      }

      const reasoningContents: Array<{
        step: number;
        content: AgentReasoningContentType;
      }> = [];
      for (const content of agentStepContents) {
        if (content.content.type === "reasoning") {
          reasoningContents.push({
            step: content.step,
            content: content.content,
          });
        }
      }

      const { content, chainOfThought } = await (async () => {
        const textFragments = interleaveConditionalNewlines(
          textContents.map((c) => c.content.value)
        );

        if (reasoningContents.length > 0) {
          return {
            content:
              // For mutliple steps outputing text content, we want to display only the last one as the final answer.
              textFragments.length > 0
                ? textFragments[textFragments.length - 1]
                : "",
            chainOfThought: reasoningContents
              .map((sc) => sc.content.value.reasoning)
              .filter((r) => !!r)
              .join("\n\n"),
          };
        } else {
          const contentParser = new AgentMessageContentParser(
            agentConfiguration,
            message.sId,
            getCoTDelimitersConfiguration({ agentConfiguration })
          );
          const parsedContent =
            await contentParser.parseContents(textFragments);
          return {
            content: parsedContent.content,
            chainOfThought: parsedContent.chainOfThought,
          };
        }
      })();

      assert(message.parentId !== null, "Agent message must have a parentId.");

      let parentMessage = messagesById.get(message.parentId) ?? null;

      // Fallback to fetch the parent message from the database if it's not in the messages map, it can happen if you are only rendering a subset of the messages.
      parentMessage ??= await MessageModel.findOne({
        where: {
          id: message.parentId,
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: message.conversationId,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
          },
        ],
      });

      // Log an error if the parent message is not found, this should not happen (hence the assert below).
      if (!parentMessage) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            conversationSId: message.sId,
            agentMessageId: agentMessage.id,
          },
          "Couldn't find parent message for agent message."
        );
      }

      assert(!!parentMessage, "Parent message must be found.");
      const userMessage = parentMessage.userMessage;
      assert(!!userMessage, "Parent message must be a userMessage.");

      let parentAgentMessage: MessageModel | null = null;

      if (
        userMessage.agenticMessageType === "agent_handover" &&
        userMessage.agenticOriginMessageId
      ) {
        parentAgentMessage =
          messagesBySId.get(userMessage.agenticOriginMessageId) ?? null;
      }

      const richMentions = getRichMentionsWithStatusForMessage(
        message.id,
        mentionRows,
        usersById,
        agentConfigurationsById
      );

      const created = message.createdAt.getTime();
      const completedTs = agentMessage.completedAt?.getTime() ?? null;
      const m = {
        id: message.id,
        agentMessageId: agentMessage.id,
        sId: message.sId,
        created,
        completedTs,
        type: "agent_message" as const,
        visibility: message.visibility,
        version: message.version,
        rank: message.rank,
        parentMessageId: parentMessage.sId,
        parentAgentMessageId: parentAgentMessage?.sId ?? null,
        status: agentMessage.status,
        actions,
        content,
        chainOfThought,
        contents: agentStepContents,
        error,
        configuration: agentConfiguration,
        skipToolsValidation: agentMessage.skipToolsValidation,
        modelInteractionDurationMs: agentMessage.modelInteractionDurationMs,
        richMentions,
        completionDurationMs: getCompletionDuration(
          created,
          completedTs,
          actions
        ),
        reactions: reactionsByMessageId[message.id] ?? [],
        prunedContext: agentMessage.prunedContext ?? false,
      } satisfies AgentMessageType;

      if (viewType === "full") {
        return new Ok(m);
      } else {
        return new Ok(getLightAgentMessageFromAgentMessage(m));
      }
    })
  );

  const errors = renderedMessages.filter((m): m is Err<ConversationError> =>
    m.isErr()
  );
  if (errors.length > 0) {
    return errors[0];
  }

  return new Ok(
    removeNulls(
      renderedMessages.map((m) => (m.isOk() ? m.value : null))
    ) as V extends "full" ? AgentMessageType[] : LightAgentMessageType[]
  );
}

async function batchRenderContentFragment(
  auth: Authenticator,
  conversationId: string,
  messages: MessageModel[]
): Promise<ContentFragmentType[]> {
  return ContentFragmentResource.batchRenderFromMessages(auth, {
    conversationId,
    messages,
  });
}

type RenderMessageVariant = "legacy-light" | "full" | "light";

export async function batchRenderMessages<V extends RenderMessageVariant>(
  auth: Authenticator,
  conversation: ConversationResource,
  messages: MessageModel[],
  viewType: V
): Promise<
  Result<
    V extends "full"
      ? MessageType[]
      : V extends "legacy-light"
        ? LegacyLightMessageType[]
        : V extends "light"
          ? LightMessageType[]
          : never,
    ConversationError
  >
> {
  const [userMessages, agentMessagesRes, contentFragments] = await Promise.all([
    batchRenderUserMessages(auth, messages),
    batchRenderAgentMessages(auth, messages, viewType),
    batchRenderContentFragment(auth, conversation.sId, messages),
  ]);

  if (agentMessagesRes.isErr()) {
    return agentMessagesRes;
  }

  const agentMessages = agentMessagesRes.value;

  let renderedMessages = [
    ...userMessages,
    ...agentMessages,
    ...contentFragments,
  ].sort((a, b) => a.rank - b.rank || a.version - b.version);

  if (viewType === "light") {
    // We need to attach the content fragments to the user messages.
    const output: LightMessageType[] = [];
    let tempContentFragments: ContentFragmentType[] = [];

    renderedMessages.forEach((message) => {
      if (isContentFragmentType(message)) {
        tempContentFragments.push(message); // Collect content fragments.
      } else {
        let messageWithContentFragments: UserMessageTypeWithContentFragments;
        if (isUserMessageType(message)) {
          // Attach collected content fragments to the user message.
          messageWithContentFragments = {
            ...message,
            contentFragments: tempContentFragments,
          };
          tempContentFragments = []; // Reset the collected content fragments.

          // Start a new group for user messages.
          output.push(messageWithContentFragments);
        } else {
          // I know this is safe because we are in the light view.
          output.push(message as LightAgentMessageType);
        }
      }
    });

    renderedMessages = output;
  }

  return new Ok(
    renderedMessages as V extends "full"
      ? MessageType[]
      : V extends "legacy-light"
        ? LegacyLightMessageType[]
        : V extends "light"
          ? LightMessageType[]
          : never
  );
}

type MessageVariant = "legacy-light" | "light";

export async function fetchConversationMessages<V extends MessageVariant>(
  auth: Authenticator,
  {
    conversationId,
    limit,
    lastRank,
    viewType,
  }: {
    conversationId: string;
    limit: number;
    lastRank: number | null;
    viewType: V;
  }
): Promise<
  Result<
    {
      hasMore: boolean;
      lastValue: number | null;
      messages: V extends "legacy-light"
        ? LegacyLightMessageType[]
        : V extends "light"
          ? LightMessageType[]
          : never;
    },
    Error
  >
> {
  const owner = auth.workspace();
  if (!owner) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  const { hasMore, messages } = await conversation.fetchMessagesForPage(auth, {
    limit,
    lastRank,
  });

  const renderedMessagesRes = await batchRenderMessages(
    auth,
    conversation,
    messages,
    viewType
  );

  if (renderedMessagesRes.isErr()) {
    return renderedMessagesRes;
  }

  const renderedMessages = renderedMessagesRes.value;

  return new Ok({
    hasMore,
    lastValue: renderedMessages.at(0)?.rank ?? null,
    messages: renderedMessages as V extends "legacy-light"
      ? LegacyLightMessageType[]
      : V extends "light"
        ? LightMessageType[]
        : never,
  });
}

export async function fetchMessageInConversation(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  messageId: string,
  version?: number
) {
  return MessageModel.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId: auth.getNonNullableWorkspace()?.id,
      ...(version ? { version } : {}),
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: false,
      },
    ],
  });
}
