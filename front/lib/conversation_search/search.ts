import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  CONVERSATION_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { ConversationSearchDocument } from "@app/types/conversation_search/conversation_search";
import type { Result } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

interface ListPrivateConversationIdsFromESParams {
  accessibleSpaceIds: string[];
  lastValue?: string;
  limit: number;
  orderDirection: "asc" | "desc";
  userId: string;
  workspaceId: string;
}

interface ListPrivateConversationIdsFromESResult {
  conversationIds: string[];
  hasMore: boolean;
  lastValue: string | null;
}

// Cursor encodes two sort values: "<updatedAtMs>|<conversationId>". The conversation_id
// tiebreaker guarantees stable pagination when multiple conversations share the same updated_at.
function parseSearchAfterCursor(
  lastValue: string | undefined
): estypes.SortResults | undefined {
  if (!lastValue) {
    return undefined;
  }

  const [tsStr, convId] = lastValue.split("|");
  const ts = parseInt(tsStr, 10);
  if (Number.isNaN(ts) || !convId) {
    return undefined;
  }

  return [ts, convId];
}

export async function listPrivateConversationIdsFromES({
  workspaceId,
  userId,
  accessibleSpaceIds,
  limit,
  lastValue,
  orderDirection,
}: ListPrivateConversationIdsFromESParams): Promise<
  Result<ListPrivateConversationIdsFromESResult, ElasticsearchError>
> {
  // Filter: all values in requested_space_ids must be in the user's accessible spaces.
  // terms_set with minimum_should_match_script = doc field length implements the
  // "superset check": every space the conversation references must be accessible.
  // When accessibleSpaceIds is empty, conversations with non-empty requested_space_ids
  // are correctly excluded (0 matches < required length).
  // When accessibleSpaceIds is non-empty we need two cases:
  //   1. Conversations with no space requirements (empty array → ES treats field as missing).
  //   2. Conversations where every required space is in the user's accessible set.
  // terms_set alone misses case 1 because ES skips documents where the field has no values,
  // even when the Painless script would return minimum=0.
  const requestedSpaceIdsFilter: estypes.QueryDslQueryContainer =
    accessibleSpaceIds.length > 0
      ? {
          bool: {
            should: [
              // Case 1: no space requirements, always accessible.
              {
                bool: {
                  must_not: [{ exists: { field: "requested_space_ids" } }],
                },
              },
              // Case 2: all required spaces are in the user's accessible set.
              {
                terms_set: {
                  requested_space_ids: {
                    terms: accessibleSpaceIds,
                    minimum_should_match_script: {
                      source: "doc['requested_space_ids'].size()",
                    },
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        }
      : {
          // No accessible spaces: only pass conversations with no space requirements.
          bool: { must_not: [{ exists: { field: "requested_space_ids" } }] },
        };

  const sortOrder = orderDirection === "desc" ? "desc" : "asc";
  const fetchLimit = limit + 1;
  const searchAfter = parseSearchAfterCursor(lastValue);

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
              },
            },
            requestedSpaceIdsFilter,
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

    const conversationIds = resultHits.flatMap((hit) =>
      hit._source?.conversation_id ? [hit._source.conversation_id] : []
    );

    const lastHit = resultHits[resultHits.length - 1];
    const newLastValue =
      lastHit?.sort?.[0] != null && lastHit.sort[1] != null
        ? `${lastHit.sort[0]}|${lastHit.sort[1]}`
        : null;

    return { conversationIds, hasMore, lastValue: newLastValue };
  });
}
