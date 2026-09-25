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

const NAME_AUTOCOMPLETE_FIELDS = [
  "name.autocomplete",
  "name.autocomplete._2gram",
  "name.autocomplete_preserved",
  "name.autocomplete_preserved._2gram",
];

/**
 * @cc [owner:tdraier,label:product] indexed-agent-name-matching
 * An empty (or whitespace-only) search term matches every agent. Otherwise every
 * whitespace-separated term MUST prefix-match a word of the agent name, in any order (`sal mar`
 * matches "Marketing Sales"); the description is not matched. Whole-word, in-order and whole-name
 * (`name.keyword`) prefix matches only add relevance.
 */
export function buildAgentNameAutocompleteQuery(
  searchTerm: string
): estypes.QueryDslQueryContainer {
  const terms = searchTerm.split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) {
    return { match_all: {} };
  }
  return {
    bool: {
      must: terms.map((term) => ({
        multi_match: {
          query: term,
          type: "bool_prefix",
          operator: "and",
          fields: NAME_AUTOCOMPLETE_FIELDS,
        },
      })),
      should: [
        {
          multi_match: {
            query: terms.join(" "),
            type: "bool_prefix",
            operator: "and",
            fields: ["name.keyword", ...NAME_AUTOCOMPLETE_FIELDS],
          },
        },
      ],
    },
  };
}
