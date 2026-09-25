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

const NAME_AUTOCOMPLETE_FIELDS = [
  "name.autocomplete",
  "name.autocomplete._2gram",
  "name.autocomplete_preserved",
  "name.autocomplete_preserved._2gram",
];

/**
 * @cc [owner:aubin-tchoi,label:product] indexed-skill-name-matching
 * Whole-name prefix matches on name.keyword contribute additional relevance.
 * Name matching uses both autocomplete fields and Elasticsearch relevance, without
 * description matching or usage boosts. Usage breaks relevance ties, then skill ID.
 * Every whitespace-separated search term must prefix-match a word of the name, in any order.
 */
export function buildSkillNameAutocompleteQuery(
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
