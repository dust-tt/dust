import type { estypes } from "@elastic/elasticsearch";

const NAME_SEARCH_FIELDS = ["name.autocomplete", "name.autocomplete_preserved"];

const NAME_AUTOCOMPLETE_FIELDS = [
  "name.autocomplete",
  "name.autocomplete._2gram",
  "name.autocomplete_preserved",
  "name.autocomplete_preserved._2gram",
];

// Elasticsearch rejects the `name.keyword` prefix and wildcard clauses below when the input is too
// long ("input automaton is too large"), from ~330 characters in the worst case. Skill names fit
// (SKILL_NAME_MAX_LENGTH); agent names may be longer (AGENT_NAME_MAX_LENGTH) but rarely are.
const MAX_SEARCH_TERM_LENGTH = 256;

/**
 * @cc [owner:tdraier;aubin-tchoi,label:product] indexed-name-matching
 * An empty (or whitespace-only) search term matches every document; one longer than
 * `MAX_SEARCH_TERM_LENGTH` characters matches none. Otherwise every
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
  // Keep the unfiltered listing for empty input.
  if (terms.length === 0) {
    return { match_all: {} };
  }
  if (searchTerm.length > MAX_SEARCH_TERM_LENGTH) {
    return { match_none: {} };
  }
  return {
    bool: {
      // Require every term, allowing the last analyzed token of each term to be a prefix.
      must: terms.map((term) => ({
        multi_match: {
          query: term,
          type: "bool_prefix",
          operator: "and",
          fields: NAME_AUTOCOMPLETE_FIELDS,
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
 * Empty or whitespace-only queries MUST match all names; queries longer than
 * `MAX_SEARCH_TERM_LENGTH` characters MUST match none. Otherwise every whitespace-separated
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
  // Keep the unfiltered listing for empty input.
  if (terms.length === 0) {
    return { match_all: {} };
  }
  if (searchTerm.length > MAX_SEARCH_TERM_LENGTH) {
    return { match_none: {} };
  }
  return {
    bool: {
      // Require every term to match the name or description, in any order.
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
            // Use description words as a weak signal, without prefixes or typos.
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
                boost: 0.1,
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
