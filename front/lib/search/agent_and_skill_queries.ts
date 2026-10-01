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
  // Keep the unfiltered listing for empty input.
  if (terms.length === 0) {
    return { match_all: {} };
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
  // Keep the unfiltered listing for empty input.
  if (terms.length === 0) {
    return { match_all: {} };
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

const DISCOVER_USAGE_BOOST_WEIGHT = 0.5;

function buildDiscoverTermQuery(term: string): estypes.QueryDslQueryContainer {
  const tiers: [estypes.QueryDslQueryContainer, number][] = [
    [
      {
        multi_match: {
          query: term,
          type: "bool_prefix",
          fields: NAME_AUTOCOMPLETE_FIELDS,
        },
      },
      3,
    ],
    [
      {
        multi_match: {
          query: term,
          fields: [...NAME_SEARCH_FIELDS, "name.english", "name.french"],
          fuzziness: "AUTO",
        },
      },
      2,
    ],
    [
      {
        multi_match: {
          query: term,
          fields: ["description", "description.english", "description.french"],
          fuzziness: "AUTO",
        },
      },
      1,
    ],
  ];

  return {
    dis_max: {
      queries: tiers.map(([filter, boost]) => ({
        constant_score: { filter, boost },
      })),
    },
  };
}

/**
 * @cc [owner:adrsimon,label:product] discover-matching
 * Empty or whitespace-only queries MUST match everything. Otherwise at least 75% of the
 * whitespace-separated terms MUST match, each through a name prefix, a fuzzy name token or a fuzzy
 * description token, where tokens also match through the built-in `english` and `french`
 * analyzers (stemming and stop words) on the matching sub-fields. Name matches MUST score above description matches. The active users count MUST add a logarithmic bump to the score, so
 * usage reorders close matches without making a non-matching item match.
 */
export function buildDiscoverSearchQuery(
  searchTerm: string
): estypes.QueryDslQueryContainer {
  const terms = searchTerm.split(/\s+/).filter((term) => term.length > 0);

  return {
    function_score: {
      query:
        terms.length === 0
          ? { match_all: {} }
          : {
              bool: {
                should: terms.map(buildDiscoverTermQuery),
                minimum_should_match: "75%",
              },
            },
      functions: [
        {
          field_value_factor: {
            field: "active_users_count",
            modifier: "log1p",
            missing: 0,
          },
          weight: DISCOVER_USAGE_BOOST_WEIGHT,
        },
      ],
      boost_mode: "sum",
    },
  };
}
