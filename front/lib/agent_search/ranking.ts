import type {
  AgentSearchSort,
  AgentSearchSortOrder,
} from "@app/types/agent_search/agent_search";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export function buildAgentDefaultSort({
  sortBy = "relevance",
  sortOrder = sortBy === "name" ? "asc" : "desc",
}: {
  sortBy?: AgentSearchSort;
  sortOrder?: AgentSearchSortOrder;
} = {}): estypes.Sort {
  switch (sortBy) {
    case "relevance":
      return [
        { _score: { order: sortOrder } },
        { active_users_count: { order: "desc", missing: "_last" } },
        // Agent ID is the tie-breaker.
        { agent_id: { order: "asc" } },
      ];
    case "usage":
      return [
        { active_users_count: { order: sortOrder, missing: "_last" } },
        // Agent ID is the tie-breaker.
        { agent_id: { order: "asc" } },
      ];
    case "name":
      return [
        { "name.keyword": { order: sortOrder, missing: "_last" } },
        // Agent ID is the tie-breaker.
        { agent_id: { order: "asc" } },
      ];
    case "updatedAt":
      return [
        // Format dates so missing-date cursors do not contain unsafe JSON integers.
        {
          updated_at: {
            order: sortOrder,
            missing: "_last",
            format: "epoch_millis",
          },
        },
        // Agent ID is the tie-breaker.
        { agent_id: { order: "asc" } },
      ];
    default:
      assertNever(sortBy);
  }
}

/**
 * @cc [owner:tdraier,label:product] indexed-agent-name-matching
 * An empty (or whitespace-only) search term matches every agent. Otherwise the agent name must
 * contain every term of the search, the last one as a prefix (earlier terms match whole words), or
 * start with the whole search via `name.keyword`; the description is not matched.
 */
export function buildAgentNameAutocompleteQuery(
  searchTerm: string
): estypes.QueryDslQueryContainer {
  const query = searchTerm.trim();
  if (!query) {
    return { match_all: {} };
  }
  return {
    multi_match: {
      query,
      type: "bool_prefix",
      operator: "and",
      fields: [
        "name.keyword",
        "name.autocomplete",
        "name.autocomplete._2gram",
        "name.autocomplete_preserved",
        "name.autocomplete_preserved._2gram",
      ],
    },
  };
}
