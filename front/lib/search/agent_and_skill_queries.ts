import type { estypes } from "@elastic/elasticsearch";

const NAME_SEARCH_FIELDS = ["name.autocomplete", "name.autocomplete_preserved"];

const NAME_AUTOCOMPLETE_FIELDS = [
  "name.autocomplete",
  "name.autocomplete._2gram",
  "name.autocomplete_preserved",
  "name.autocomplete_preserved._2gram",
];

/**
 * @cc [owner:tdraier;aubin-tchoi,label:product] indexed-name-matching
 * An empty (or whitespace-only) search term matches every document. Otherwise every
 * whitespace-separated term MUST match the name autocomplete fields as a `bool_prefix` query,
 * in any order (`sal mar` matches "Marketing Sales"). Terms are analyzed like the name (case-change
 * and punctuation splits), so only a term's last token is prefix-matched (`ReportB` matches
 * "Report Builder"). The description is not matched. Whole-word, in-order and whole-name
 * (`name.keyword`) prefix matches only add relevance. Exact whole-name matches MUST receive an
 * additional relevance boost. Matching MUST NOT apply usage boosts.
 */
export function buildNameAutocompleteQuery(
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
          constant_score: {
            filter: { term: { "name.keyword": searchTerm } },
          },
        },
        {
          multi_match: {
            query: searchTerm,
            type: "bool_prefix",
            operator: "and",
            fields: ["name.keyword", ...NAME_AUTOCOMPLETE_FIELDS],
          },
        },
      ],
    },
  };
}

/**
 * @cc [owner:aubin-tchoi,label:product] name-token-matching
 * Empty or whitespace-only queries MUST match all names. Otherwise every whitespace-separated
 * term MUST match an analyzed name token, a literal name substring, a fuzzy name token, or an
 * analyzed description token (`write` MUST match "Typewriter").
 * Names MUST use the existing autocomplete and ICU fields for word and fuzzy matching, and
 * the existing keyword field for substring matching. Description matching MUST NOT use fuzziness
 * or prefix matching.
 * For each term, exact name tokens MUST score above name substrings, which MUST score above fuzzy
 * name matches, which MUST score above description matches. The substring branch MUST treat
 * wildcard operators in user input literally. Exact whole-name matches MUST receive an additional
 * relevance boost.
 */
export function buildNameSearchQuery(
  searchTerm: string
): estypes.QueryDslQueryContainer {
  const terms = searchTerm.split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) {
    return { match_all: {} };
  }
  return {
    bool: {
      must: terms.map((term) => ({
        dis_max: {
          queries: [
            {
              constant_score: {
                filter: {
                  multi_match: {
                    query: term,
                    fields: NAME_SEARCH_FIELDS,
                    operator: "and",
                  },
                },
                boost: 2,
              },
            },
            {
              constant_score: {
                filter: {
                  wildcard: {
                    "name.keyword": {
                      // Escape wildcard syntax so the input remains a literal substring.
                      value: `*${term.replace(/[\\*?]/g, "\\$&")}*`,
                    },
                  },
                },
                boost: 1.5,
              },
            },
            {
              constant_score: {
                filter: {
                  multi_match: {
                    query: term,
                    fields: NAME_SEARCH_FIELDS,
                    operator: "and",
                    fuzziness: "AUTO",
                  },
                },
              },
            },
            {
              constant_score: {
                filter: {
                  match: {
                    description: {
                      query: term,
                      operator: "and",
                    },
                  },
                },
                boost: 0.5,
              },
            },
          ],
        },
      })),
      should: [
        {
          constant_score: {
            filter: { term: { "name.keyword": searchTerm.trim() } },
            boost: 3,
          },
        },
      ],
    },
  };
}
