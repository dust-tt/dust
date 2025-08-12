import type { WhereOptions } from "sequelize";
import { Op, Sequelize } from "sequelize";

import { MCPActionType } from "@app/lib/actions/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
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
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ContentFragmentType,
  ConversationWithoutContentType,
  FetchConversationMessagesResponse,
  LightAgentMessageType,
  LightMessageWithRankType,
  MessageWithRankType,
  ModelId,
  Result,
  UserMessageType,
} from "@app/types";
import { ConversationError, Err, Ok, removeNulls } from "@app/types";
import type {
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

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

function enhanceMCPActionWithServerId(
  agentMCPActions: MCPActionType[],
  agentMessages: Message[],
  agentConfigurations: AgentConfigurationType[]
) {
  // Resolve the MCP server id for the actions - only for full view
  return agentMCPActions.map((agentMCPAction) => {
    const agentConfigurationId = agentMessages.find(
      (message) => message.agentMessageId === agentMCPAction.agentMessageId
    )?.agentMessage?.agentConfigurationId;
    const agentConfiguration = agentConfigurations.find(
      (a) => a.sId === agentConfigurationId
    );
    const action = agentConfiguration?.actions?.find(
      (ac) => `${ac.id}` === `${agentMCPAction.mcpServerConfigurationId}`
    );
    if (action) {
      return new MCPActionType({
        ...agentMCPAction,
        mcpServerId: isServerSideMCPServerConfiguration(action)
          ? action.internalMCPServerId
          : action.clientSideMcpServerId,
      });
    }
    return agentMCPAction;
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
  const [{ agentConfigurations, lightAgentConfigurations }, agentMCPActions] =
    await Promise.all([
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
        if (viewType === "full") {
          const agents = await getAgentConfigurations(auth, {
            agentIds: [...agentConfigurationIds],
            variant: "full",
          });
          return {
            agentConfigurations: agents,
            lightAgentConfigurations: agents,
          };
        } else {
          const agents = await getAgentConfigurations(auth, {
            agentIds: [...agentConfigurationIds],
            variant: "extra_light",
          });
          return {
            agentConfigurations: null,
            lightAgentConfigurations: agents,
          };
        }
      })(),
      (async () => {
        const agentStepContents =
          await AgentStepContentResource.fetchByAgentMessages(auth, {
            agentMessageIds,
            includeMCPActions: true,
            latestVersionsOnly: true,
          });
        return agentStepContents
          .map((sc) => sc.toJSON().mcpActions ?? [])
          .flat();
      })(),
    ]);

  const enhancedAgentMCPActions =
    viewType === "full" && agentConfigurations
      ? enhanceMCPActionWithServerId(
          agentMCPActions,
          agentMessages,
          agentConfigurations
        )
      : agentMCPActions;

  if (!lightAgentConfigurations) {
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

      const actions = enhancedAgentMCPActions
        .filter((a) => a.agentMessageId === agentMessage.id)
        .sort((a, b) => a.step - b.step);

      const agentConfiguration = lightAgentConfigurations.find(
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
        agentMessage.agentStepContents
          ?.sort((a, b) => a.step - b.step || a.index - b.index)
          .map((sc) => ({
            step: sc.step,
            content: sc.value,
          })) ?? [];
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
        if (reasoningContents.length > 0) {
          // don't use the content parser, we just use raw contents and native CoT
          return {
            content: textContents.map((c) => c.content.value).join(""),
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
          const parsedContent = await contentParser.parseContents(
            textContents.map((r) => r.content.value)
          );
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
        type: "agent_message" as const,
        visibility: message.visibility,
        version: message.version,
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
