import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentMessageType,
  LightConversationType,
  LightMessageType,
  MessageType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  ConversationError,
  isAgentMessageType,
  isUserMessageType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isArrayOf } from "@app/types/shared/typescipt_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op, type WhereOptions } from "sequelize";

// Helper type to map viewType to the correct message type
type MessageTypeForView<V extends "light" | "full"> = V extends "light"
  ? LightMessageType
  : V extends "full"
    ? MessageType
    : never;

export const getConversation = async (
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false,
  branchId: string | null = null,
  lastInteractionsToFetchToolOutputContentFor: number | null = null,
  messagePagination?: { limit: number; lastRank: number | null }
) =>
  _getConversation(
    auth,
    conversationId,
    includeDeleted,
    branchId,
    "full",
    lastInteractionsToFetchToolOutputContentFor,
    messagePagination
  );

export const getLightConversation = async (
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false,
  branchId: string | null = null
) => _getConversation(auth, conversationId, includeDeleted, branchId, "light");

async function _getConversation<V extends "light" | "full">(
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false,
  branchId: string | null = null,
  viewType: V = "full" as V,
  lastInteractionsToFetchToolOutputContentFor: number | null = null,
  messagePagination?: { limit: number; lastRank: number | null }
): Promise<
  Result<
    (V extends "light"
      ? LightConversationType
      : V extends "full"
        ? ConversationType
        : never) & { hasMore?: boolean; lastValue?: number | null },
    ConversationError
  >
> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    { includeDeleted }
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  let where: WhereOptions<MessageModel> = {
    conversationId: conversation.id,
    workspaceId: owner.id,
  };

  if (branchId) {
    const branch = await ConversationBranchResource.fetchById(auth, branchId);
    if (!branch || !branch.canRead(auth)) {
      return new Err(new ConversationError("branch_not_found"));
    }

    const previousMessage = await MessageModel.findOne({
      where: {
        id: branch.previousMessageId,
        workspaceId: owner.id,
      },
    });
    if (!previousMessage) {
      return new Err(new ConversationError("message_not_found"));
    }

    const branchModelId = branch.id;

    // All messages before the branch and the branch itself.
    where = {
      ...where,
      [Op.or]: [
        {
          branchId: branchModelId,
        },
        {
          branchId: null,
          rank: { [Op.lte]: previousMessage.rank },
        },
      ],
    };
  } else {
    // All messages not part of a branch.
    where = {
      ...where,
      branchId: { [Op.is]: null },
    };
  }

  let messages: MessageModel[];
  let paginationHasMore: boolean | undefined;

  if (messagePagination) {
    const { hasMore, messages: paginatedMessages } =
      await conversation.fetchMessagesForPage(auth, {
        limit: messagePagination.limit,
        lastRank: messagePagination.lastRank,
      });
    messages = paginatedMessages;
    paginationHasMore = hasMore;
  } else {
    messages = await MessageModel.findAll({
      where,
      order: [
        ["rank", "ASC"],
        ["version", "ASC"],
      ],
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
  }

  let messagesWithToolOutputContent: Set<ModelId> | null = null;

  // In the case of the agentic loop, to save memory and latency, we only want to fetch content for the last N interactions.
  if (lastInteractionsToFetchToolOutputContentFor !== null) {
    if (lastInteractionsToFetchToolOutputContentFor <= 0) {
      messagesWithToolOutputContent = new Set();
    } else {
      const interactions = groupMessagesIntoInteractions(
        removeNulls(
          messages.map((m) => {
            if (m.userMessageId) {
              return {
                id: m.userMessageId,
                role: "user",
              };
            } else if (m.agentMessageId) {
              return {
                id: m.agentMessageId,
                role: "agent",
              };
            }
            // We don't care about the other messages.
          })
        )
      );

      // Keep the last N interactions with the highest ranks (order is correct because of the sort above).
      const interactionsToKeep = interactions.slice(
        -lastInteractionsToFetchToolOutputContentFor
      );

      // We only need to fetch content for the actions of the last N interactions.
      messagesWithToolOutputContent = new Set(
        interactionsToKeep.flatMap((i) =>
          i.messages.filter((m) => m.role === "agent").map((m) => m.id)
        )
      );
    }
  }

  const renderRes = await batchRenderMessages(
    auth,
    conversation,
    messages,
    viewType,
    messagesWithToolOutputContent
  );

  if (renderRes.isErr()) {
    return new Err(renderRes.error);
  }

  // TypeScript will now properly narrow based on viewType
  const messagesWithRank = renderRes.value as MessageTypeForView<V>[];

  // We pre-create an array that will hold
  // the versions of each User/Assistant/ContentFragment message. The length of that array is by definition the
  // maximal rank of the conversation messages we just retrieved. In the case there is no message
  // the rank is -1 and the array length is 0 as expected.
  const rankMax = messages.reduce((acc, m) => Math.max(acc, m.rank), -1);
  const content: MessageTypeForView<V>[][] = Array.from(
    { length: rankMax + 1 },
    () => []
  );

  // Fill content array with proper typing
  for (const m of messagesWithRank) {
    content[m.rank].push(m);
  }

  const { actionRequired, lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      conversation.id
    );

  if (viewType === "light") {
    // We only keep the last version of each message.
    const typeCheckedContent: (
      | LightAgentMessageType
      | UserMessageTypeWithContentFragments
    )[] = removeNulls(
      (content as LightMessageType[][]).map((c) => {
        if (c.length === 0) {
          return null;
        } else if (
          isArrayOf<LightMessageType, LightAgentMessageType>(
            c,
            (m: LightMessageType): m is LightAgentMessageType => {
              return m.type === "agent_message";
            }
          )
        ) {
          return c[c.length - 1];
        } else if (
          isArrayOf<LightMessageType, UserMessageTypeWithContentFragments>(
            c,
            isUserMessageTypeWithContentFragments
          )
        ) {
          return c[c.length - 1];
        } else {
          throw new Error(
            "Unexpected content type as everything should be array of same type. This should never happen."
          );
        }
      })
    );

    const conversationType: LightConversationType & {
      hasMore?: boolean;
      lastValue?: number | null;
    } = {
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      updated: conversation.updatedAt.getTime(),
      sId: conversation.sId,
      owner,
      title: conversation.title,
      visibility: conversation.visibility,
      depth: conversation.depth,
      triggerId: conversation.triggerSId,
      content: typeCheckedContent,
      actionRequired,
      unread: lastReadAt === null || conversation.updatedAt > lastReadAt,
      lastReadMs: lastReadAt?.getTime() ?? null,
      hasError: conversation.hasError,
      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      spaceId: conversation.space?.sId ?? null,
      metadata: conversation.metadata,
      branchId,
      ...(conversation.forkedFrom && { forkedFrom: conversation.forkedFrom }),
    };

    if (paginationHasMore !== undefined) {
      conversationType.hasMore = paginationHasMore;
      conversationType.lastValue =
        messagesWithRank.length > 0 ? messagesWithRank[0].rank : null;
    }

    return new Ok(conversationType) as Result<
      (V extends "light"
        ? LightConversationType
        : V extends "full"
          ? ConversationType
          : never) & { hasMore?: boolean; lastValue?: number | null },
      ConversationError
    >;
  } else {
    // TypeScript now knows messagesWithRank is MessageType[]
    const typeCheckedContent: (
      | AgentMessageType[]
      | UserMessageType[]
      | ContentFragmentType[]
    )[] = removeNulls(
      (content as MessageType[][]).map((c) => {
        if (c.length === 0) {
          return null;
        } else if (
          isArrayOf<MessageType, AgentMessageType>(c, isAgentMessageType)
        ) {
          return c.map((m) => m);
        } else if (
          isArrayOf<MessageType, UserMessageType>(c, isUserMessageType)
        ) {
          return c.map((m) => m);
        } else if (
          isArrayOf<MessageType, ContentFragmentType>(c, isContentFragmentType)
        ) {
          return c.map((m) => m);
        } else {
          throw new Error(
            "Unexpected content type as everything should be array of same type. This should never happen."
          );
        }
      })
    );

    const conversationType: ConversationType & {
      hasMore?: boolean;
      lastValue?: number | null;
    } = {
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      updated: conversation.updatedAt.getTime(),
      sId: conversation.sId,
      owner,
      title: conversation.title,
      visibility: conversation.visibility,
      depth: conversation.depth,
      triggerId: conversation.triggerSId,
      content: typeCheckedContent,
      actionRequired,
      unread: lastReadAt === null || conversation.updatedAt > lastReadAt,
      lastReadMs: lastReadAt?.getTime() ?? null,
      hasError: conversation.hasError,

      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      spaceId: conversation.space?.sId ?? null,
      metadata: conversation.metadata,
      branchId,
      ...(conversation.forkedFrom && { forkedFrom: conversation.forkedFrom }),
    };

    if (paginationHasMore !== undefined) {
      conversationType.hasMore = paginationHasMore;
      conversationType.lastValue =
        messagesWithRank.length > 0 ? messagesWithRank[0].rank : null;
    }

    return new Ok(conversationType) as Result<
      (V extends "light"
        ? LightConversationType
        : V extends "full"
          ? ConversationType
          : never) & { hasMore?: boolean; lastValue?: number | null },
      ConversationError
    >;
  }
}
