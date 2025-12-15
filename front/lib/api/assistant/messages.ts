import assert from "assert";

import {
  AgentMessageContentParser,
  getCoTDelimitersConfiguration,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
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
import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationWithoutContentType,
  LegacyLightMessageType,
  LightAgentConfigurationType,
  LightAgentMessageType,
  MessageType,
  Result,
  RichMention,
  UserMessageType,
  UserType,
} from "@app/types";
import {
  ConversationError,
  Err,
  isContentFragmentType,
  isUserMessageType,
  Ok,
  removeNulls,
  toMentionType,
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentContentItemType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import {
  isAgentFunctionCallContent,
  isAgentReasoningContent,
  isAgentTextContent,
} from "@app/types/assistant/agent_message_content";
import type {
  LightMessageType,
  ParsedContentItem,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";

function getRichMentionsForMessage(
  message: MessageModel,
  mentionRows: MentionModel[],
  usersById: Map<number, UserType>,
  agentConfigurationsById: Map<string, LightAgentConfigurationType>
): RichMention[] {
  return removeNulls(
    mentionRows
      // Keep only the mentions for the current message.
      .filter((m) => m.messageId === message.id)
      // Map the mentions to rich mentions.
      .map((m) => {
        if (m.agentConfigurationId) {
          const agentConfiguration = agentConfigurationsById.get(
            m.agentConfigurationId
          );
          if (agentConfiguration) {
            return toRichAgentMentionType(agentConfiguration);
          }
        } else if (m.userId) {
          const mentionnedUser = usersById.get(m.userId);
          if (mentionnedUser) {
            return toRichUserMentionType(mentionnedUser);
          }
        } else {
          throw new Error(
            "Unreachable: Mention type not supported, it must either be an agent mention or a user mention"
          );
        }
      })
  );
}

export async function generateParsedContents(
  actions: AgentMCPActionWithOutputType[],
  agentConfiguration: LightAgentConfigurationType,
  messageId: string,
  contents: { step: number; content: AgentContentItemType }[]
): Promise<Record<number, ParsedContentItem[]>> {
  const parsedContents: Record<number, ParsedContentItem[]> = {};
  const actionsByCallId = new Map(actions.map((a) => [a.functionCallId, a]));

  for (const c of contents) {
    const step = c.step + 1; // Convert to 1-indexed for display
    if (!parsedContents[step]) {
      parsedContents[step] = [];
    }

    if (isAgentReasoningContent(c.content)) {
      const reasoning = c.content.value.reasoning;
      if (reasoning && reasoning.trim()) {
        parsedContents[step].push({ kind: "reasoning", content: reasoning });
      }
      continue;
    }

    if (isAgentTextContent(c.content)) {
      const contentParser = new AgentMessageContentParser(
        agentConfiguration,
        messageId,
        getDelimitersConfiguration({ agentConfiguration })
      );
      const parsedContent = await contentParser.parseContents([
        c.content.value,
      ]);

      if (parsedContent.chainOfThought && parsedContent.chainOfThought.trim()) {
        parsedContents[step].push({
          kind: "reasoning",
          content: parsedContent.chainOfThought,
        });
      }
      continue;
    }

    if (isAgentFunctionCallContent(c.content)) {
      const functionCallId = c.content.value.id;
      const matchingAction = actionsByCallId.get(functionCallId);

      if (matchingAction) {
        parsedContents[step].push({ kind: "action", action: matchingAction });
      }
    }
  }

  return parsedContents;
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

  return userMessages.map((message) => {
    if (!message.userMessage) {
      throw new Error(
        "Unreachable: batchRenderUserMessages has been filtered on user messages"
      );
    }
    const userMessage = message.userMessage;
    const user = userMessage.userId ? usersById.get(userMessage.userId) : null;

    const richMentions = getRichMentionsForMessage(
      message,
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
          variant: "extra_light",
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

      const parsedContents = await generateParsedContents(
        actions,
        agentConfiguration,
        message.sId,
        agentStepContents
      );

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
            content: textFragments.join(""),
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

      let parentMessage = message.parentId
        ? (messagesById.get(message.parentId) ?? null)
        : null;

      if (!parentMessage) {
        logger.info(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            conversationSId: message.sId,
            agentMessageId: agentMessage.id,
          },
          "Couldn't find parent message for agent message in the messages map, can happen if you are only rendering a subset of the messages. Falling back to fetch the message from the database."
        );
        parentMessage = await MessageModel.findOne({
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
      }

      assert(!!parentMessage, "Parent message must be found.");
      const userMessage = parentMessage.userMessage;
      assert(!!userMessage, "Parent message must be a userMessage.");

      let parentAgentMessage: MessageModel | null = null;

      // TODO(2025-11-24 PPUL): Remove this block once data has been backfilled
      if (
        userMessage.userContextOrigin === "agent_handover" &&
        userMessage.userContextOriginMessageId
      ) {
        parentAgentMessage =
          messagesBySId.get(userMessage.userContextOriginMessageId) ?? null;
      }
      // END TODO

      if (
        userMessage.agenticMessageType === "agent_handover" &&
        userMessage.agenticOriginMessageId
      ) {
        parentAgentMessage =
          messagesBySId.get(userMessage.agenticOriginMessageId) ?? null;
      }

      const richMentions = getRichMentionsForMessage(
        message,
        mentionRows,
        usersById,
        agentConfigurationsById
      );

      const m = {
        id: message.id,
        agentMessageId: agentMessage.id,
        sId: message.sId,
        created: message.createdAt.getTime(),
        completedTs: agentMessage.completedAt?.getTime() ?? null,
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
        rawContents: textContents.map((c) => ({
          step: c.step,
          content: c.content.value,
        })),
        contents: agentStepContents,
        parsedContents,
        error,
        configuration: agentConfiguration,
        skipToolsValidation: agentMessage.skipToolsValidation,
        modelInteractionDurationMs: agentMessage.modelInteractionDurationMs,
        richMentions,
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
  const messagesWithContentFragment = messages.filter(
    (m) => !!m.contentFragment
  );
  if (messagesWithContentFragment.find((m) => !m.contentFragment)) {
    throw new Error(
      "Unreachable: batchRenderContentFragment must be called with only content fragments"
    );
  }

  return Promise.all(
    messagesWithContentFragment.map(async (message: MessageModel) => {
      const contentFragment = ContentFragmentResource.fromMessage(message);
      const render = await contentFragment.renderFromMessage({
        auth,
        conversationId,
        message,
      });

      return render;
    })
  );
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
