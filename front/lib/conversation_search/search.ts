import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  CONVERSATION_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type {
  ConversationListItemType,
  ConversationMetadata,
} from "@app/types/assistant/conversation";
import type { ConversationSearchDocument } from "@app/types/conversation_search/conversation_search";
import type { Result } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

interface ListPrivateConversationsFromESParams {
  lastValue?: string;
  limit: number;
  nonMemberProjectSpaceIds: string[];
  orderDirection: "asc" | "desc";
  userId: string;
  workspaceId: string;
}

interface ListPrivateConversationsFromESResult {
  items: ConversationListItemType[];
  hasMore: boolean;
  lastValue: string | null;
}

// Cursor encodes two sort values: "<updatedAtMs>|<conversationId>". The conversation_id
// tiebreaker guarantees stable pagination when multiple conversations share the same updated_at.
// A plain-timestamp cursor (from the DB path) is also accepted: a synthetic tiebreaker is
// injected so pagination continues from approximately the right place rather than restarting
// from page 1.
function parseSearchAfterCursor(
  lastValue: string | undefined,
  orderDirection: "asc" | "desc"
): estypes.SortResults | undefined {
  if (!lastValue) {
    return undefined;
  }

  const [tsStr, convId] = lastValue.split("|");
  const ts = parseInt(tsStr, 10);
  if (Number.isNaN(ts)) {
    return undefined;
  }

  // For a DB-style cursor (no convId), synthesise a tiebreaker that places us just past
  // the timestamp boundary: max string for desc, empty string for asc.
  const tiebreaker = convId ?? (orderDirection === "desc" ? "\\uFFFF" : "");
  return [ts, tiebreaker];
}

export async function listPrivateConversationsFromES({
  workspaceId,
  userId,
  limit,
  lastValue,
  nonMemberProjectSpaceIds,
  orderDirection,
}: ListPrivateConversationsFromESParams): Promise<
  Result<ListPrivateConversationsFromESResult, ElasticsearchError>
> {
  const sortOrder = orderDirection === "desc" ? "desc" : "asc";
  const fetchLimit = limit + 1;
  const searchAfter = parseSearchAfterCursor(lastValue, orderDirection);

  return withEs(async (client) => {
    const response = await client.search<ConversationSearchDocument>({
      index: CONVERSATION_SEARCH_ALIAS_NAME,
      routing: workspaceId,
      size: fetchLimit,
      query: {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { term: { visibility: "unlisted" } },
            // Private conversations have no space_id field.
            { bool: { must_not: [{ exists: { field: "space_id" } }] } },
            {
              nested: {
                path: "participants",
                query: { term: { "participants.user_id": userId } },
                // Return the matched participant's per-user fields alongside the hit.
                inner_hits: {
                  size: 1,
                },
              },
            },
            // Mirror the DB path: hide conversations that reference a project space
            // the user is not a member of. Only project spaces are filtered; regular,
            // global, and system spaces do not trigger exclusion.
            ...(nonMemberProjectSpaceIds.length > 0
              ? [
                  {
                    bool: {
                      must_not: [
                        {
                          terms: {
                            requested_space_ids: nonMemberProjectSpaceIds,
                          },
                        },
                      ],
                    },
                  },
                ]
              : []),
          ],
        },
      },
      sort: [
        { updated_at: { order: sortOrder } },
        { conversation_id: { order: sortOrder } },
      ],
      ...(searchAfter && { search_after: searchAfter }),
    });

    const hits = response.hits.hits;
    const hasMore = hits.length > limit;
    const resultHits = hasMore ? hits.slice(0, limit) : hits;

    const items: ConversationListItemType[] = resultHits.flatMap((hit) => {
      const source = hit._source;
      if (!source) {
        return [];
      }

      const innerHit =
        hit.inner_hits?.participants?.hits?.hits?.[0]?._source ?? {};
      const participantData = innerHit as {
        action_required?: boolean;
      };

      const actionRequired = participantData.action_required ?? false;
      const updatedMs = new Date(source.updated_at).getTime();

      // lastReadMs and unread are volatile per-user state not stored in ES.
      // They are hydrated from DB by the caller after this function returns.
      return [
        {
          actionRequired,
          created: new Date(source.created_at).getTime(),
          hasError: source.has_error,
          lastReadMs: null,
          metadata: (source.metadata ?? {}) as ConversationMetadata,
          nextWakeupAt: source.next_wakeup_at
            ? new Date(source.next_wakeup_at).getTime()
            : null,
          requestedSpaceIds: source.requested_space_ids,
          sId: source.conversation_id,
          spaceId: source.space_id ?? null,
          title: source.title,
          triggerId: source.trigger_id ?? null,
          unread: true,
          updated: updatedMs,
          isRunningAgentLoop: !!source.is_running_agent_loop,
        },
      ];
    });

    const lastHit = resultHits[resultHits.length - 1];
    const newLastValue =
      lastHit?.sort?.[0] != null && lastHit.sort[1] != null
        ? `${lastHit.sort[0]}|${lastHit.sort[1]}`
        : null;

    return { items, hasMore, lastValue: newLastValue };
  });
}
