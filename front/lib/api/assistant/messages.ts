import type { WhereOptions } from "sequelize";
import { Op, Sequelize } from "sequelize";

import { browseActionTypesFromAgentMessageIds } from "@app/lib/actions/browse";
import { conversationIncludeFileTypesFromAgentMessageIds } from "@app/lib/actions/conversation/include_file";
import { dustAppRunTypesFromAgentMessageIds } from "@app/lib/actions/dust_app_run";
import { mcpActionTypesFromAgentMessageIds } from "@app/lib/actions/mcp";
import { processActionTypesFromAgentMessageIds } from "@app/lib/actions/process";
import { reasoningActionTypesFromAgentMessageIds } from "@app/lib/actions/reasoning";
import { retrievalActionTypesFromAgentMessageIds } from "@app/lib/actions/retrieval";
import { searchLabelsActionTypesFromAgentMessageIds } from "@app/lib/actions/search_labels";
import { tableQueryTypesFromAgentMessageIds } from "@app/lib/actions/tables_query";
import { websearchActionTypesFromAgentMessageIds } from "@app/lib/actions/websearch";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import type { PaginationParams } from "@app/lib/api/pagination";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import {
  AgentMessage,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentActionType,
  AgentMessageType,
  ContentFragmentType,
  ConversationWithoutContentType,
  FetchConversationMessagesResponse,
  LightAgentConfigurationType,
  LightAgentMessageType,
  LightMessageWithRankType,
  MessageWithRankType,
  ModelId,
  Result,
  UserMessageType,
} from "@app/types";
import { ConversationError, Err, Ok, removeNulls } from "@app/types";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";

async function batchRenderUserMessages(
  auth: Authenticator,
  messages: Message[]
): Promise<{ m: UserMessageType; rank: number; version: number }[]> {
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
    const user = users.find((u) => u.id === userMessage.userId) || null;

    const m = {
      id: message.id,
      sId: message.sId,
      type: "user_message",
      visibility: message.visibility,
      version: message.version,
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
      },
    } satisfies UserMessageType;
    return { m, rank: message.rank, version: message.version };
  });
}

async function batchRenderAgentMessages<V extends RenderMessageVariant>(
  auth: Authenticator,
  messages: Message[],
  viewType: V
): Promise<
  Result<
    V extends "full"
      ? { m: AgentMessageType; rank: number; version: number }[]
      : { m: LightAgentMessageType; rank: number; version: number }[],
    ConversationError
  >
> {
  const agentMessages = messages.filter((m) => !!m.agentMessage);
  const agentMessageIds = removeNulls(
    agentMessages.map((m) => m.agentMessageId || null)
  );
  const [
    agentConfigurations,
    agentRetrievalActions,
    agentDustAppRunActions,
    agentTablesQueryActions,
    agentProcessActions,
    agentWebsearchActions,
    agentBrowseActions,
    agentConversationIncludeFileActions,
    agentReasoningActions,
    agentSearchLabelsActions,
    agentMCPActions,
  ] = await Promise.all([
    (async () => {
      const agentConfigurationIds: Set<string> = agentMessages.reduce(
        (acc: Set<string>, m) => {
          const agentId = m.agentMessage?.agentConfigurationId;
          if (agentId) {
            acc.add(agentId);
          }
          return acc;
        },
        new Set<string>()
      );
      const agents = await getAgentConfigurations({
        auth,
        agentsGetView: { agentIds: [...agentConfigurationIds] },
        variant: "extra_light",
      });
      if (agents.some((a) => !a)) {
        return null;
      }
      return agents as LightAgentConfigurationType[];
    })(),
    (async () =>
      retrievalActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () => dustAppRunTypesFromAgentMessageIds(auth, agentMessageIds))(),
    (async () =>
      tableQueryTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () =>
      processActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () =>
      websearchActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () =>
      browseActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () =>
      conversationIncludeFileTypesFromAgentMessageIds(auth, {
        agentMessageIds,
      }))(),
    (async () =>
      reasoningActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () =>
      searchLabelsActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
    (async () =>
      mcpActionTypesFromAgentMessageIds(auth, { agentMessageIds }))(),
  ]);

  if (!agentConfigurations) {
    return new Err(
      new ConversationError("conversation_with_unavailable_agent")
    );
  }

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

      const actions: AgentActionType[] = [
        agentBrowseActions,
        agentConversationIncludeFileActions,
        agentDustAppRunActions,
        agentProcessActions,
        agentReasoningActions,
        agentRetrievalActions,
        agentSearchLabelsActions,
        agentTablesQueryActions,
        agentWebsearchActions,
        agentMCPActions,
      ]
        .flat()
        .filter((a) => a.agentMessageId === agentMessage.id)
        .sort((a, b) => a.step - b.step);

      const agentConfiguration = agentConfigurations.find(
        (a) => a.sId === agentMessage.agentConfigurationId
      );
      if (!agentConfiguration) {
        throw new Error(
          "Unreachable: agent configuration must be found for agent message"
        );
      }

      let error: {
        code: string;
        message: string;
      } | null = null;

      if (
        agentMessage.errorCode !== null &&
        agentMessage.errorMessage !== null
      ) {
        error = {
          code: agentMessage.errorCode,
          message: agentMessage.errorMessage,
        };
      }

      const rawContents =
        agentMessage.agentMessageContents?.sort((a, b) => a.step - b.step) ??
        [];
      const contentParser = new AgentMessageContentParser(
        agentConfiguration,
        message.sId,
        getDelimitersConfiguration({ agentConfiguration })
      );
      const parsedContent = await contentParser.parseContents(
        rawContents.map((r) => r.content)
      );
      const m = {
        id: message.id,
        agentMessageId: agentMessage.id,
        sId: message.sId,
        created: message.createdAt.getTime(),
        type: "agent_message" as const,
        visibility: message.visibility,
        version: message.version,
        parentMessageId:
          messages.find((m) => m.id === message.parentId)?.sId ?? null,
        status: agentMessage.status,
        actions,
        content: parsedContent.content,
        chainOfThought: parsedContent.chainOfThought,
        rawContents:
          agentMessage.agentMessageContents?.map((rc) => ({
            step: rc.step,
            content: rc.content,
          })) ?? [],
        error,
        configuration: agentConfiguration,
        skipToolsValidation: agentMessage.skipToolsValidation,
      } satisfies AgentMessageType;

      if (viewType === "full") {
        return { m, rank: message.rank, version: message.version };
      } else {
        return {
          m: getLightAgentMessageFromAgentMessage(m),
          rank: message.rank,
          version: message.version,
        };
      }
    })
  );
  return new Ok(
    renderedMessages as V extends "full"
      ? { m: AgentMessageType; rank: number; version: number }[]
      : { m: LightAgentMessageType; rank: number; version: number }[]
  );
}

async function batchRenderContentFragment(
  auth: Authenticator,
  conversationId: string,
  messages: Message[]
): Promise<{ m: ContentFragmentType; rank: number; version: number }[]> {
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

      return {
        m: render,
        rank: message.rank,
        version: message.version,
      };
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
            model: AgentMessageContent,
            as: "agentMessageContents",
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
    V extends "full" ? MessageWithRankType[] : LightMessageWithRankType[],
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

  if (agentMessages.some((m) => !canReadMessage(auth, m.m))) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const renderedMessages = [
    ...userMessages,
    ...agentMessages,
    ...contentFragments,
  ]
    .sort((a, b) => a.rank - b.rank || a.version - b.version)
    .map(({ m, rank }) => ({ ...m, rank }));

  return new Ok(
    renderedMessages as V extends "full"
      ? MessageWithRankType[]
      : LightMessageWithRankType[]
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
  messageId: string
) {
  return Message.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId: auth.getNonNullableWorkspace()?.id,
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
