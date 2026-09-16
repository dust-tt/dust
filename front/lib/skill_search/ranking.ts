import type { SearchMode } from "@app/types/api/skills";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

/**
 * @cc [owner:aubin-tchoi,label:product] indexed-skill-name-matching
 * Name matching uses the autocomplete field and Elasticsearch relevance. The
 * ICU-folded keyword field is the pagination sort key, followed by skill ID.
 */
export function buildSkillMatchQuery(
  searchTerm: string,
  mode: SearchMode = "autocomplete"
): estypes.QueryDslQueryContainer {
  const query = searchTerm.trim();
  if (!query) {
    return { match_all: {} };
  }
  const nameMatch: estypes.QueryDslQueryContainer = {
    multi_match: {
      query,
      type: "bool_prefix",
      operator: "and",
      fields: [
        "name.autocomplete",
        "name.autocomplete._2gram",
        "name.autocomplete._3gram",
      ],
    },
  };
  if (mode === "autocomplete") {
    return nameMatch;
  }
  return {
    bool: {
      should: [
        nameMatch,
        { match: { description: { query, operator: "and" } } },
      ],
      minimum_should_match: 1,
    },
  };
}

export function applySearchRanking(
  query: estypes.QueryDslQueryContainer,
  mode: SearchMode
): estypes.QueryDslQueryContainer {
  switch (mode) {
    case "autocomplete":
      return query;
    case "management":
      return {
        script_score: {
          query,
          script: {
            source:
              "1 + (doc['active_users_count'].size() == 0 ? 0 : doc['active_users_count'].value)",
          },
        },
      };
    case "discovery":
      return {
        script_score: {
          query,
          script: {
            source:
              "_score + Math.log1p(doc['active_users_count'].size() == 0 ? 0 : doc['active_users_count'].value)",
          },
        },
      };
    default:
      return assertNever(mode);
  }
}
