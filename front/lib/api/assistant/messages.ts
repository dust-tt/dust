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
  AgentMessage,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
import logger, { auditLog } from "@app/logger/logger";
import type {
  AgentMention,
  AgentMessageType,
  ContentFragmentType,
  ConversationWithoutContentType,
  LegacyLightMessageType,
  LightAgentConfigurationType,
  LightAgentMessageType,
  MessageType,
  Result,
  UserMention,
  UserMessageType,
} from "@app/types";
import {
  ConversationError,
  Err,
  isContentFragmentType,
  isUserMessageType,
  Ok,
  removeNulls,
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
  messages: Message[]
): Promise<UserMessageType[]> {
  const userMessages = messages.filter(
    (m) => m.userMessage !== null && m.userMessage !== undefined
  );

  const userIds = [
    ...new Set(
      userMessages
        .map((m) => m.userMessage?.userId)
        .filter((id) => !!id) as number[]
    ),
  ];

  const [mentions, users] = await Promise.all([
    Mention.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        messageId: userMessages.map((m) => m.id),
      },
      include: {
        model: UserModel,
        as: "user",
        attributes: ["sId"],
      },
    }),
    userIds.length === 0
      ? []
      : UserResource.fetchByModelIds([...new Set(userIds)]),
  ]);

  return userMessages.map((message) => {
    if (!message.userMessage) {
      throw new Error(
        "Unreachable: batchRenderUserMessages has been filtered on user messages"
      );
    }
    const userMessage = message.userMessage;
    const messageMentions = mentions.filter((m) => m.messageId === message.id);
    const user = users.find((u) => u.id === userMessage.userId) ?? null;

    return {
      id: message.id,
      sId: message.sId,
      type: "user_message",
      visibility: message.visibility,
      version: message.version,
      rank: message.rank,
      created: message.createdAt.getTime(),
      user: user ? user.toJSON() : null,
      mentions: messageMentions
        ? messageMentions.map((m) => {
            if (m.agentConfigurationId) {
              return {
                configurationId: m.agentConfigurationId,
              } satisfies AgentMention;
            }
            if (m.user) {
              return {
                type: "user",
                userId: m.user.sId,
              } satisfies UserMention;
            }
            throw new Error("Mention Must Be An Agent or User: Unreachable.");
          })
        : [],
      content: userMessage.content,
      context: {
        username: userMessage.userContextUsername,
        timezone: userMessage.userContextTimezone,
        fullName: userMessage.userContextFullName,
        email: userMessage.userContextEmail,
        profilePictureUrl: userMessage.userContextProfilePictureUrl,
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
  messages: Message[],
  viewType: V
): Promise<
  Result<
    V extends "full" ? AgentMessageType[] : LightAgentMessageType[],
    ConversationError
  >
> {
  const agentMessages = messages.filter((m) => !!m.agentMessage);
  const agentMessageIds = removeNulls(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    agentMessages.map((m) => m.agentMessageId || null)
  );
  // Get all unique pairs id-version for the agent configurations
  const agentConfigurationIds = agentMessages.reduce((acc, m) => {
    if (m.agentMessage) {
      acc.add(m.agentMessage.agentConfigurationId);
    }
    return acc;
  }, new Set<string>());

  const agentConfigurations = await getAgentConfigurations(auth, {
    agentIds: [...agentConfigurationIds],
    variant: "extra_light",
  });

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

      const agentConfiguration = agentConfigurations.find(
        (a) => a.sId === agentMessage.agentConfigurationId
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
        parentMessage = await Message.findOne({
          where: {
            id: message.parentId,
            workspaceId: auth.getNonNullableWorkspace().id,
            conversationId: message.conversationId,
          },
          include: [
            {
              model: UserMessage,
              as: "userMessage",
              required: false,
            },
          ],
        });
      }

      assert(parentMessage !== null, "Parent message must be found.");

      let parentAgentMessage: Message | null = null;

      // TODO(2025-11-24 PPUL): Remove this block once data has been backfilled
      if (
        parentMessage &&
        parentMessage?.userMessage &&
        parentMessage.userMessage.userContextOrigin === "agent_handover" &&
        parentMessage.userMessage.userContextOriginMessageId
      ) {
        parentAgentMessage =
          messagesBySId.get(
            parentMessage.userMessage.userContextOriginMessageId
          ) ?? null;
      }
      // END TODO

      if (
        parentMessage &&
        parentMessage?.userMessage &&
        parentMessage.userMessage.agenticMessageType === "agent_handover" &&
        parentMessage.userMessage.agenticOriginMessageId
      ) {
        parentAgentMessage =
          messagesBySId.get(parentMessage.userMessage.agenticOriginMessageId) ??
          null;
      }

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
  messages: Message[]
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
    messagesWithContentFragment.map(async (message: Message) => {
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
  messages: Message[],
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
  return Message.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId: auth.getNonNullableWorkspace()?.id,
      ...(version ? { version } : {}),
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessage,
        as: "agentMessage",
        required: false,
      },
    ],
  });
}

export async function softDeleteUserMessage(
  auth: Authenticator,
  {
    messageId,
    conversation,
  }: {
    messageId: string;
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<{ success: true }, ConversationError>> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  const message = await fetchMessageInConversation(
    auth,
    conversation,
    messageId
  );

  if (!message || !message.userMessage) {
    return new Err(new ConversationError("message_not_found"));
  }

  if (message.userMessage.userId !== user.id) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  if (message.visibility === "deleted") {
    return new Ok({ success: true });
  }

  await message.update({
    visibility: "deleted",
  });

  auditLog(
    {
      workspaceId: owner.sId,
      userId: user.sId,
      conversationId: conversation.sId,
      messageId: message.sId,
    },
    "User deleted their message"
  );

  return new Ok({ success: true });
}

export async function softDeleteAgentMessage(
  auth: Authenticator,
  {
    messageId,
    conversation,
  }: {
    messageId: string;
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<{ success: true }, ConversationError>> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  const message = await fetchMessageInConversation(
    auth,
    conversation,
    messageId
  );

  if (!message || !message.agentMessage) {
    return new Err(new ConversationError("message_not_found"));
  }

  if (!message.parentId) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  const parentMessage = await Message.findOne({
    where: {
      id: message.parentId,
      workspaceId: owner.id,
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
      },
    ],
  });

  if (!parentMessage || !parentMessage.userMessage) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  if (parentMessage.userMessage.userId !== user.id) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  if (message.visibility === "deleted") {
    return new Ok({ success: true });
  }

  await message.update({
    visibility: "deleted",
  });

  auditLog(
    {
      workspaceId: owner.sId,
      userId: user.sId,
      conversationId: conversation.sId,
      messageId: message.sId,
    },
    "User deleted an agent message"
  );

  return new Ok({ success: true });
}
