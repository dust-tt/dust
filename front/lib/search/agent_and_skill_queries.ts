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
 * whitespace-separated term MUST match either a name prefix or a fuzzy name word, in any order
 * (`sal mar` matches "Marketing Sales", `writter` matches "Writer"). Prefix matches MUST score
 * above fuzzy word matches. Terms are analyzed like the name (case-change and punctuation splits), so only a term's last token is prefix-matched (`ReportB` matches
 * "Report Builder"). The description is not matched. Whole-word, in-order and whole-name
 * (`name.keyword`) prefix matches only add relevance. Exact whole-name matches MUST receive an
 * additional relevance boost. Matching MUST NOT apply usage boosts.
 */
export function buildNameAutocompleteQuery(
  searchTerm: string
): estypes.QueryDslQueryContainer {
  const terms = searchTerm.split(/\s+/).filter((term) => term.length > 0);
  // Keep the unfiltered listing for empty input.
  if (terms.length === 0) {
    return { match_all: {} };
  }
  return {
    bool: {
      // Require every term to match a name prefix or a fuzzy word, in any order.
      must: terms.map((term) => ({
        // Keep only the strongest match so typos cannot add to a prefix match's score.
        dis_max: {
          queries: [
            // Keep prefix completion ranked above fuzzy word matches.
            {
              constant_score: {
                filter: {
                  multi_match: {
                    query: term,
                    type: "bool_prefix",
                    operator: "and",
                    fields: NAME_AUTOCOMPLETE_FIELDS,
                  },
                },
                boost: 2,
              },
            },
            // Allow word typos; bool_prefix does not apply fuzziness to its final token.
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
          ],
        },
      })),
      // These optional clauses improve ranking without excluding matching names.
      should: [
        // Boost an exact match of the entire name.
        {
          constant_score: {
            filter: { term: { "name.keyword": searchTerm } },
          },
        },
        // Boost whole-query prefix matches, including matching word order in shingles.
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
 * term MUST match an analyzed name token, a literal name substring, or a fuzzy name token
 * (`write` MUST match "Typewriter"). Name mode MUST NOT match descriptions.
 * Names MUST use the existing autocomplete and ICU fields for word and fuzzy matching, and
 * the existing keyword field for substring matching.
 * For each term, exact name tokens MUST score above name substrings, which MUST score above fuzzy
 * name matches. The substring branch MUST treat wildcard operators in user input literally. Exact whole-name matches MUST receive an additional
 * relevance boost.
 */
export function buildNameSearchQuery(
  searchTerm: string
): estypes.QueryDslQueryContainer {
  const terms = searchTerm.split(/\s+/).filter((term) => term.length > 0);
  // Keep the unfiltered listing for empty input.
  if (terms.length === 0) {
    return { match_all: {} };
  }
  return {
    bool: {
      // Require every term to match the name, in any order.
      must: terms.map((term) => ({
        // Use the strongest matching clause for each term instead of adding their scores.
        dis_max: {
          queries: [
            // Rank exact analyzed word matches highest.
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
            // Match literal substrings within the name, escaping user wildcard syntax.
            {
              constant_score: {
                filter: {
                  wildcard: {
                    "name.keyword": {
                      value: `*${term.replace(/[\\*?]/g, "\\$&")}*`,
                    },
                  },
                },
                boost: 1.5,
              },
            },
            // Allow typos with Elasticsearch's automatic edit-distance thresholds.
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
          ],
        },
      })),
      // These optional clauses improve ranking without excluding matching names.
      should: [
        // Boost an exact match of the entire name.
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
