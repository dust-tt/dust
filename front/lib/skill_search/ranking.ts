import type { SkillSearchSort } from "@app/types/api/skills";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export function buildSkillDefaultSort(
  sortBy: SkillSearchSort = "relevance"
): estypes.Sort {
  switch (sortBy) {
    case "relevance":
      return [
        { _score: { order: "desc" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    case "usage":
      return [
        { active_users_count: { order: "desc", missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    default:
      assertNever(sortBy);
  }
}

/**
 * @cc [owner:aubin-tchoi,label:product] indexed-skill-name-matching
 * Name matching uses both autocomplete fields and Elasticsearch relevance, without
 * description matching or usage boosts. Skill ID breaks relevance ties.
 */
export function buildSkillNameAutocompleteQuery(
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
        "name.autocomplete",
        "name.autocomplete._2gram",
        "name.autocomplete_preserved",
        "name.autocomplete_preserved._2gram",
      ],
    },
  };
}
