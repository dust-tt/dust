import type { Interaction } from "@app/lib/api/assistant/conversation/interactions";
import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  CompactionMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type {
  AgentMessageType,
  CompactionMessageType,
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
  isCompactionMessageType,
  isUserMessageType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isArrayOf } from "@app/types/shared/typescipt_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  ConversationForDataSourceSyncType,
  // biome-ignore lint/plugin/enforceClientTypesInPublicApi: useful to convert for sync
} from "@dust-tt/client";
import {
  ConversationForDataSourceSyncSchema,
  // biome-ignore lint/plugin/enforceClientTypesInPublicApi: useful to convert for sync
} from "@dust-tt/client";
import type { WhereOptions } from "sequelize";

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
  lastInteractionsToFetchToolOutputContentFor: number | null = null,
  messagePagination?: { limit: number; lastRank: number | null }
) =>
  _getConversation(
    auth,
    conversationId,
    includeDeleted,
    "full",
    lastInteractionsToFetchToolOutputContentFor,
    messagePagination
  );

export const getLightConversation = async (
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false,
  lastInteractionsToFetchToolOutputContentFor: number | null = null,
  messagePagination?: { limit: number; lastRank: number | null }
) =>
  _getConversation(
    auth,
    conversationId,
    includeDeleted,
    "light",
    lastInteractionsToFetchToolOutputContentFor,
    messagePagination,
    true
  );

// Batch size (in interactions) for extending the tool-output-content fetch window beyond the
// guaranteed floor. The boundary is anchored on a fixed, absolute interaction index rather than
// distance from the most recent interaction, so it only advances once a full batch of new
// interactions has accumulated instead of sliding by one every single turn.
//
// When the boundary does advance, every interaction between the old and new checkpoint loses its
// tool-output content in a single turn (see computeMessagesWithToolOutputContent), which busts the
// prompt cache for that turn. A larger batch means fewer crossings overall. It also means most
// conversations whose interaction count never reaches the threshold never cross it at all. 30 is a
// placeholder pending real data on the interaction-count distribution (see the
// "conversation.interactions_count" metric below). Revisit once that data is in.
export const TOOL_OUTPUT_FETCH_BATCH_SIZE = 30;

/**
 * Decides which agent messages should have their tool-output content fetched.
 *
 * The last `floorCount` interactions are always included. Beyond that floor, the window extends
 * backward to the most recent checkpoint at or before the floor's start, a fixed multiple of
 * TOOL_OUTPUT_FETCH_BATCH_SIZE. Because checkpoints are fixed positions counted from the start of
 * the conversation, not from the tail, the boundary stays put across most turns and only jumps
 * forward once a whole batch has accumulated.
 */
export function computeMessagesWithToolOutputContent(
  interactions: Interaction<{ id: ModelId; role: "user" | "agent" }>[],
  floorCount: number
): Set<ModelId> {
  if (floorCount <= 0) {
    return new Set();
  }

  const floorStart = Math.max(interactions.length - floorCount, 0);
  const checkpointStart =
    Math.floor(floorStart / TOOL_OUTPUT_FETCH_BATCH_SIZE) *
    TOOL_OUTPUT_FETCH_BATCH_SIZE;

  return new Set(
    interactions
      .slice(checkpointStart)
      .flatMap((i) =>
        i.messages.filter((m) => m.role === "agent").map((m) => m.id)
      )
  );
}

async function _getConversation<V extends "light" | "full">(
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false,
  viewType: V = "full" as V,
  lastInteractionsToFetchToolOutputContentFor: number | null = null,
  messagePagination?: { limit: number; lastRank: number | null },
  textContentOnly: boolean = false
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
    { includeDeleted, includeForkingData: true }
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  const where: WhereOptions<MessageModel> = {
    conversationId: conversation.id,
    workspaceId: owner.id,
  };

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
    // The include.where lands in the LEFT JOIN ON clause (required: false keeps the OUTER join),
    // letting the planner use the side tables' (workspaceId, conversationId) indexes instead of
    // one PK probe per message. Relies on conversationId being backfilled on side tables.
    const sideTableWhere = {
      workspaceId: owner.id,
      conversationId: conversation.id,
    };
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
          where: sideTableWhere,
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
          where: sideTableWhere,
        },
        // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
        // along with messages in one query). Only once we move to a MessageResource will we be able
        // to properly abstract this.
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          required: false,
          where: sideTableWhere,
        },
        {
          model: CompactionMessageModel,
          as: "compactionMessage",
          required: false,
          where: sideTableWhere,
        },
      ],
    });
  }

  let messagesWithToolOutputContent: Set<ModelId> | null = null;

  // In the case of the agentic loop, to save memory and latency, we don't want to fetch tool
  // output content for every interaction in the conversation. See
  // computeMessagesWithToolOutputContent for how the fetch window is decided.
  if (lastInteractionsToFetchToolOutputContentFor !== null) {
    const interactions = groupMessagesIntoInteractions(
      removeNulls(
        messages.map((m) => {
          if (m.userMessageId) {
            return {
              id: m.userMessageId,
              role: "user" as const,
            };
          } else if (m.agentMessageId) {
            return {
              id: m.agentMessageId,
              role: "agent" as const,
            };
          }
          // We don't care about the other messages.
        })
      )
    );

    // Purely observational, see TOOL_OUTPUT_FETCH_BATCH_SIZE above.
    getStatsDClient().distribution(
      "conversation.interactions_count",
      interactions.length
    );

    messagesWithToolOutputContent = computeMessagesWithToolOutputContent(
      interactions,
      lastInteractionsToFetchToolOutputContentFor
    );
  }

  const renderRes = await batchRenderMessages(
    auth,
    conversation,
    messages,
    viewType,
    messagesWithToolOutputContent,
    textContentOnly
  );

  if (renderRes.isErr()) {
    return new Err(renderRes.error);
  }

  // TypeScript will now properly narrow based on viewType
  const messagesWithRank = renderRes.value as MessageTypeForView<V>[];
  const forkingData = await conversation.fetchForkingData(auth);

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
      | CompactionMessageType
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
        } else if (
          isArrayOf<LightMessageType, CompactionMessageType>(
            c,
            isCompactionMessageType
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
      isRunningAgentLoop: conversation.isRunningAgentLoop,
      ...(forkingData && { forkingData }),
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
      | CompactionMessageType[]
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
        } else if (
          isArrayOf<MessageType, CompactionMessageType>(
            c,
            isCompactionMessageType
          )
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
      isRunningAgentLoop: conversation.isRunningAgentLoop,
      ...(forkingData && { forkingData }),
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

export function toConversationForDataSourceSync(
  conversation: LightConversationType
): ConversationForDataSourceSyncType {
  const content = removeNulls(
    conversation.content.map((msg) => {
      const type = msg.type;
      switch (type) {
        case "user_message": {
          return {
            type: "user_message" as const,
            created: msg.created,
            visibility: msg.visibility,
            content: msg.content,
            user: msg.user
              ? {
                  sId: msg.user.sId,
                  fullName: msg.user.fullName,
                  username: msg.user.username,
                  email: msg.user.email,
                }
              : null,
            contentFragments: msg.contentFragments.map((cf) => ({
              type: "content_fragment" as const,
              created: cf.created,
              visibility: cf.visibility,
              contentFragmentId: cf.contentFragmentId,
              contentType: cf.contentType,
              title: cf.title,
              version: cf.version,
              sourceUrl: cf.sourceUrl,
            })),
          };
        }
        case "agent_message": {
          return {
            type: "agent_message" as const,
            created: msg.created,
            visibility: msg.visibility,
            configuration: { name: msg.configuration.name },
            content: msg.content,
          };
        }

        case "compaction_message": {
          // Ignore compaction messages for sync, we want the full signal.
          return null;
        }

        default: {
          assertNever(type);
        }
      }
      return null;
    })
  );
  return ConversationForDataSourceSyncSchema.parse({
    sId: conversation.sId,
    created: conversation.created,
    updated: conversation.updated,
    title: conversation.title,
    visibility: conversation.visibility,
    url: getConversationRoute(
      conversation.owner.sId,
      conversation.sId,
      undefined,
      config.getAppUrl()
    ),
    content,
  });
}

// Lists conversations in a space along with their full content, formatted for
// the connectors-driven sync flow (each conversation is enriched with a public
// URL and backward-compatible fields). Includes deleted conversations so sync
// can detect and remove them.
export async function listSpaceConversationsForSync(
  auth: Authenticator,
  {
    spaceId,
    workspaceId,
    updatedSinceMs,
  }: {
    spaceId: string;
    workspaceId: string;
    updatedSinceMs: number | null;
  }
) {
  const spaceConversations =
    await ConversationResource.listConversationsInSpace(auth, {
      spaceId,
      options: {
        dangerouslySkipPermissionFiltering: true, // System key has access
        includeDeleted: true,
        updatedSince: updatedSinceMs ?? undefined,
      },
    });

  const conversationsFull = await concurrentExecutor(
    spaceConversations,
    async (c) => getLightConversation(auth, c.sId, true),
    { concurrency: 4 }
  );

  const conversations = removeNulls(
    conversationsFull.map((c) => (c.isOk() ? c.value : null))
  );

  return conversations
    .map((c) => ({
      ...c,
      url: getConversationRoute(
        workspaceId,
        c.sId,
        undefined,
        config.getAppUrl()
      ),
    }))
    .map(toConversationForDataSourceSync);
}
