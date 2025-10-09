import type { WhereOptions } from "sequelize";
import { Op, Sequelize } from "sequelize";

import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { PaginationParams } from "@app/lib/api/pagination";
import { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import {
  AgentMessage,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationWithoutContentType,
  FetchConversationMessagesResponse,
  LightAgentConfigurationType,
  LightAgentMessageType,
  LightMessageType,
  MessageType,
  ModelId,
  Result,
  UserMessageType,
} from "@app/types";
import { ConversationError, Err, Ok, removeNulls } from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentContentItemType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";
import {
  isFunctionCallContent,
  isReasoningContent,
  isTextContent,
} from "@app/types/assistant/agent_message_content";
import type { ParsedContentItem } from "@app/types/assistant/conversation";

export function getMaximalVersionAgentStepContent(
  agentStepContents: AgentStepContentModel[]
): AgentStepContentModel[] {
  const maxVersionStepContents = agentStepContents.reduce((acc, current) => {
    const key = `${current.step}-${current.index}`;
    const existing = acc.get(key);
    if (!existing || current.version > existing.version) {
      acc.set(key, current);
    }
    return acc;
  }, new Map<string, AgentStepContentModel>());

  return Array.from(maxVersionStepContents.values());
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

    if (isReasoningContent(c.content)) {
      const reasoning = c.content.value.reasoning;
      if (reasoning && reasoning.trim()) {
        parsedContents[step].push({ kind: "reasoning", content: reasoning });
      }
      continue;
    }

    if (isTextContent(c.content)) {
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

    if (isFunctionCallContent(c.content)) {
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const user = users.find((u) => u.id === userMessage.userId) || null;

    const m = {
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
              };
            }
            throw new Error("Mention Must Be An Agent: Unreachable.");
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
        originMessageId: userMessage.userContextOriginMessageId,
        clientSideMCPServerIds: userMessage.clientSideMCPServerIds,
        lastTriggerRunAt:
          userMessage.userContextLastTriggerRunAt?.getTime() ?? null,
      },
    } satisfies UserMessageType;
    return m;
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

      const textContents: Array<{ step: number; content: TextContentType }> =
        [];
      for (const content of agentStepContents) {
        if (content.content.type === "text_content") {
          textContents.push({ step: content.step, content: content.content });
        }
      }

      const reasoningContents: Array<{
        step: number;
        content: ReasoningContentType;
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
            getDelimitersConfiguration({ agentConfiguration })
          );
          const parsedContent =
            await contentParser.parseContents(textFragments);
          return {
            content: parsedContent.content,
            chainOfThought: parsedContent.chainOfThought,
          };
        }
      })();

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
        parentMessageId:
          messages.find((m) => m.id === message.parentId)?.sId ?? null,
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

/**
 * This function retrieves the latest version of each message for the current page,
 * because there's no easy way to fetch only the latest version of a message.
 */
async function getMaxRankMessages(
  auth: Authenticator,
  conversation: ConversationResource,
  paginationParams: PaginationParams
): Promise<ModelId[]> {
  const { limit, orderColumn, orderDirection, lastValue } = paginationParams;

  const where: WhereOptions<Message> = {
    conversationId: conversation.id,
    workspaceId: auth.getNonNullableWorkspace().id,
  };

  if (lastValue) {
    const op = orderDirection === "desc" ? Op.lt : Op.gt;

    where[orderColumn as any] = {
      [op]: lastValue,
    };
  }

  // Retrieve the latest version and corresponding Id of each message for the current page,
  // grouped by rank and limited to the desired page size plus one to detect the presence of a next page.
  const messages = await Message.findAll({
    attributes: [
      [Sequelize.fn("MAX", Sequelize.col("version")), "maxVersion"],
      [Sequelize.fn("MAX", Sequelize.col("id")), "id"],
    ],
    where,
    group: ["rank"],
    order: [[orderColumn, orderDirection === "desc" ? "DESC" : "ASC"]],
    limit: limit + 1,
  });

  return messages.map((m) => m.id);
}

async function fetchMessagesForPage(
  auth: Authenticator,
  conversation: ConversationResource,
  paginationParams: PaginationParams
): Promise<{ hasMore: boolean; messages: Message[] }> {
  const { orderColumn, orderDirection, limit } = paginationParams;

  const messageIds = await getMaxRankMessages(
    auth,
    conversation,
    paginationParams
  );

  const hasMore = messageIds.length > limit;
  const relevantMessageIds = hasMore ? messageIds.slice(0, limit) : messageIds;

  // Then fetch all those messages and their associated resources.
  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: auth.getNonNullableWorkspace().id,
      id: {
        [Op.in]: relevantMessageIds,
      },
    },
    order: [[orderColumn, orderDirection === "desc" ? "DESC" : "ASC"]],
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
        include: [
          {
            model: AgentStepContentModel,
            as: "agentStepContents",
            required: false,
          },
        ],
      },
      // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
      // along with messages in one query). Only once we move to a MessageResource will we be able
      // to properly abstract this.
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: false,
      },
    ],
  });

  // Filter to only keep the step content with the maximum version for each step and index combination.
  for (const message of messages) {
    if (message.agentMessage && message.agentMessage.agentStepContents) {
      message.agentMessage.agentStepContents =
        getMaximalVersionAgentStepContent(
          message.agentMessage.agentStepContents
        );
    }
  }

  return {
    hasMore,
    messages,
  };
}

type RenderMessageVariant = "light" | "full";

export async function batchRenderMessages<V extends RenderMessageVariant>(
  auth: Authenticator,
  conversationId: string,
  messages: Message[],
  viewType: V
): Promise<
  Result<
    V extends "full" ? MessageType[] : LightMessageType[],
    ConversationError
  >
> {
  const [userMessages, agentMessagesRes, contentFragments] = await Promise.all([
    batchRenderUserMessages(auth, messages),
    batchRenderAgentMessages(auth, messages, viewType),
    batchRenderContentFragment(auth, conversationId, messages),
  ]);

  if (agentMessagesRes.isErr()) {
    return agentMessagesRes;
  }

  const agentMessages = agentMessagesRes.value;

  if (agentMessages.some((m) => !canReadMessage(auth, m))) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const renderedMessages = [
    ...userMessages,
    ...agentMessages,
    ...contentFragments,
  ].sort((a, b) => a.rank - b.rank || a.version - b.version);

  return new Ok(
    renderedMessages as V extends "full" ? MessageType[] : LightMessageType[]
  );
}

export async function fetchConversationMessages(
  auth: Authenticator,
  conversationId: string,
  paginationParams: PaginationParams
): Promise<Result<FetchConversationMessagesResponse, Error>> {
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

  const { hasMore, messages } = await fetchMessagesForPage(
    auth,
    conversation,
    paginationParams
  );

  const renderedMessagesRes = await batchRenderMessages(
    auth,
    conversationId,
    messages,
    "light"
  );

  if (renderedMessagesRes.isErr()) {
    return renderedMessagesRes;
  }

  const renderedMessages = renderedMessagesRes.value;

  return new Ok({
    hasMore,
    lastValue: renderedMessages.at(0)?.rank ?? null,
    messages: renderedMessages,
  });
}

export function canReadMessage(
  auth: Authenticator,
  message: AgentMessageType | LightAgentMessageType
) {
  return auth.canRead(
    Authenticator.createResourcePermissionsFromGroupIds(
      message.configuration.requestedGroupIds
    )
  );
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
