import type { estypes } from "@elastic/elasticsearch";

import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { USER_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { LightWorkspaceType } from "@app/types";
import type { Result } from "@app/types/shared/result";
import type { UserSearchDocument } from "@app/types/user_search/user_search";

interface SearchUsersResult {
  users: UserSearchDocument[];
  total: number;
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
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  offset: number;
  limit: number;
}): Promise<Result<SearchUsersResult, ElasticsearchError>> {
  return withEs(async (client) => {
    // If searchTerm is empty or only whitespace, return all users from the workspace.
    const hasSearchTerm = searchTerm && searchTerm.trim().length > 0;

    const query: estypes.QueryDslQueryContainer = {
      bool: {
        filter: [{ term: { workspace_id: owner.sId } }],
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

    const response = await client.search<UserSearchDocument>({
      index: USER_SEARCH_ALIAS_NAME,
      query,
      size: limit,
      from: offset,
      sort: [{ _score: { order: "desc" } }],
    });

    const users = response.hits.hits.map((hit) => hit._source!);
    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    return {
      users,
      total,
    };
  });
}
