import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { USER_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { UserSearchDocument } from "@app/types/user_search/user_search";
import type { estypes } from "@elastic/elasticsearch";

const USER_SEARCH_SCAN_PAGE_SIZE = 1000;

export interface SearchUsersResult {
  users: UserSearchDocument[];
  total: number;
}

// Optional ordering for browsing/listing use cases. When omitted, results are
// ranked by relevance (`_score`), which is what free-text search wants.
export type SearchUsersOrderBy = {
  field: "name" | "email";
  direction: "asc" | "desc";
};

function buildUserSearchQuery({
  owner,
  searchTerm,
  userIds,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  userIds?: string[];
}): estypes.QueryDslQueryContainer {
  const hasSearchTerm = searchTerm.trim().length > 0;

  return {
    bool: {
      filter: [
        { term: { workspace_id: owner.sId } },
        ...(userIds ? [{ terms: { user_id: userIds } }] : []),
      ],
      ...(hasSearchTerm && {
        should: [
          // Prefix matching on full_name using edge n-grams
          {
            match_phrase_prefix: {
              "full_name.edge": {
                query: searchTerm,
              },
            },
          },
          // Token matching on email (works with email tokenizer)
          {
            match_phrase_prefix: {
              email: {
                query: searchTerm,
              },
            },
          },
        ],
        minimum_should_match: 1,
      }),
    },
  };
}

function buildUserSearchSort(orderBy?: SearchUsersOrderBy): estypes.Sort {
  // When an explicit order is requested, sort on the keyword sub-field (with
  // `user_id` as a stable tiebreaker for consistent pagination); otherwise
  // rank by relevance. `full_name.keyword` / `email.keyword` exist in the
  // index mapping.
  return orderBy
    ? [
        {
          [orderBy.field === "name" ? "full_name.keyword" : "email.keyword"]: {
            order: orderBy.direction,
          },
        },
        { user_id: { order: "asc" } },
      ]
    : [{ _score: { order: "desc" } }];
}

function getTotalHits(
  total: estypes.SearchTotalHits | number | undefined
): number {
  return typeof total === "number" ? total : (total?.value ?? 0);
}

function getUserSearchHitSources(
  hits: estypes.SearchHit<UserSearchDocument>[]
): UserSearchDocument[] {
  return hits.flatMap((hit) => (hit._source ? [hit._source] : []));
}

/**
 * Search users by email and full name.
 * - full_name: Uses prefix matching on any word (edge n-grams)
 * - email: Uses token matching (uax_url_email tokenizer)
 */
export async function searchUsers({
  owner,
  searchTerm,
  offset,
  limit,
  orderBy,
  userIds,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  offset: number;
  limit: number;
  orderBy?: SearchUsersOrderBy;
  userIds?: string[];
}): Promise<Result<SearchUsersResult, ElasticsearchError>> {
  return withEs(async (client) => {
    const response = await client.search<UserSearchDocument>({
      index: USER_SEARCH_ALIAS_NAME,
      query: buildUserSearchQuery({ owner, searchTerm, userIds }),
      size: limit,
      from: offset,
      sort: buildUserSearchSort(orderBy),
      track_total_hits: true,
    });

    return {
      users: getUserSearchHitSources(response.hits.hits),
      total: getTotalHits(response.hits.total),
    };
  });
}

export async function searchAllUsers({
  owner,
  searchTerm,
  userIds,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  userIds?: string[];
}): Promise<Result<SearchUsersResult, ElasticsearchError>> {
  return withEs(async (client) => {
    const query = buildUserSearchQuery({ owner, searchTerm, userIds });
    const sort: estypes.Sort = [
      { "full_name.keyword": { order: "asc" } },
      { user_id: { order: "asc" } },
    ];

    let total = 0;
    let fetchedHitCount = 0;
    let searchAfter: estypes.SortResults | undefined;
    const users: UserSearchDocument[] = [];

    while (true) {
      const response = await client.search<UserSearchDocument>({
        index: USER_SEARCH_ALIAS_NAME,
        query,
        size: USER_SEARCH_SCAN_PAGE_SIZE,
        sort,
        track_total_hits: true,
        ...(searchAfter ? { search_after: searchAfter } : {}),
      });

      const hits = response.hits.hits;
      total = getTotalHits(response.hits.total);
      fetchedHitCount += hits.length;
      users.push(...getUserSearchHitSources(hits));

      if (
        hits.length < USER_SEARCH_SCAN_PAGE_SIZE ||
        fetchedHitCount >= total
      ) {
        break;
      }

      const lastSort = hits[hits.length - 1]?.sort;
      if (!lastSort) {
        break;
      }
      searchAfter = lastSort;
    }

    return { users, total };
  });
}
