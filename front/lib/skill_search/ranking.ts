import type { estypes } from "@elastic/elasticsearch";

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
