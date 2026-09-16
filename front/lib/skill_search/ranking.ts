import type { SearchMode } from "@app/types/api/skills";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

// Fixed scores make indexed and code-defined skills comparable without corpus
// statistics. Code-defined matching is a lightweight approximation of ES analysis.
const MATCH_SCORES = {
  exact: 100,
  prefix: 80,
  name: 60,
  description: 20,
};

/**
 * @cc [owner:aubin-tchoi,label:product] indexed-skill-name-matching
 * Exact matching folds the whole name; word-prefix matching uses autocomplete
 * fields. The ICU-folded keyword field is the pagination sort key, followed by skill ID.
 */
export function buildSkillMatchQuery(
  searchTerm: string,
  mode: SearchMode = "autocomplete"
): estypes.QueryDslQueryContainer {
  const query = searchTerm.trim();
  if (!query) {
    return { constant_score: { filter: { match_all: {} }, boost: 1 } };
  }
  const matches: estypes.QueryDslQueryContainer[] = [
    {
      constant_score: {
        filter: {
          match: { name: query },
        },
        boost: MATCH_SCORES.exact,
      },
    },
    {
      constant_score: {
        filter: {
          prefix: { "name.keyword": { value: query } },
        },
        boost: MATCH_SCORES.prefix,
      },
    },
    {
      constant_score: {
        filter: {
          multi_match: {
            query,
            type: "bool_prefix",
            operator: "and",
            fields: [
              "name.autocomplete",
              "name.autocomplete._2gram",
              "name.autocomplete._3gram",
              "name.autocomplete_preserved",
              "name.autocomplete_preserved._2gram",
              "name.autocomplete_preserved._3gram",
            ],
          },
        },
        boost: MATCH_SCORES.name,
      },
    },
  ];
  if (mode !== "autocomplete") {
    matches.push({
      constant_score: {
        filter: { match: { description: { query, operator: "and" } } },
        boost: MATCH_SCORES.description,
      },
    });
  }
  return { dis_max: { tie_breaker: 0, queries: matches } };
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
