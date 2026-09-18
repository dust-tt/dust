import type { estypes } from "@elastic/elasticsearch";

export function buildSkillDefaultSort(): estypes.Sort {
  return [
    { _score: { order: "desc" } },
    // Name and skill ID are tie-breakers for results with the same score.
    { "name.keyword": { order: "asc" } },
    { skill_id: { order: "asc" } },
  ];
}

/**
 * @cc [owner:aubin-tchoi,label:product] indexed-skill-name-matching
 * Name matching uses both autocomplete fields and Elasticsearch relevance, without
 * description matching or usage boosts. The ICU-folded keyword field and skill ID
 * break relevance ties.
 */
export function buildSkillMatchQuery(
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
