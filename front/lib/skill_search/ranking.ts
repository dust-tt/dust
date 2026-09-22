import type {
  SkillSearchSort,
  SkillSearchSortOrder,
} from "@app/types/api/skills";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export function buildSkillDefaultSort({
  sortBy = "relevance",
  sortOrder = sortBy === "name" ? "asc" : "desc",
}: {
  sortBy?: SkillSearchSort;
  sortOrder?: SkillSearchSortOrder;
} = {}): estypes.Sort {
  switch (sortBy) {
    case "relevance":
      return [
        { _score: { order: sortOrder } },
        { active_users_count: { order: "desc", missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    case "usage":
      return [
        { active_users_count: { order: sortOrder, missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    case "name":
      return [
        { "name.keyword": { order: sortOrder, missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
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
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    default:
      assertNever(sortBy);
  }
}

/**
 * @cc [owner:aubin-tchoi,label:product] indexed-skill-name-matching
 * Whole-name prefix matches on name.keyword contribute additional relevance.
 * Name matching uses both autocomplete fields and Elasticsearch relevance, without
 * description matching or usage boosts. Usage breaks relevance ties, then skill ID.
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
        "name.keyword",
        "name.autocomplete",
        "name.autocomplete._2gram",
        "name.autocomplete_preserved",
        "name.autocomplete_preserved._2gram",
      ],
    },
  };
}
