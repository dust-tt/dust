import type { UserProfile } from "./types.ts";

export type EsQuery = Record<string, unknown>;

export type MatchMode = "bool_prefix" | "best_fields" | "hybrid";

export type NameFallback = "subsequence" | "fuzzy" | "both" | "off";

const NAME_FALLBACK_BOOST = 4;

const PREFIX_CLAUSE_BOOST = 0.5;

// Lucene refuses to determinize a subsequence automaton much past this; the pattern is
// only meaningful for a single token anyway, since the field holds the whole name. It is
// applied to `name` only: on a description-length field a short subsequence matches nearly
// everything.
const MAX_SUBSEQUENCE_LENGTH = 24;

export interface SearchContext {
  readableSpaceIds: string[];
  userGroupIds: string[];
  userEmail: string | null;
}

export interface SearchParams extends SearchContext {
  searchTerm: string;
  scopes: string[];
  includeInstructions: boolean;
  minShouldMatch: string;
  matchMode: MatchMode;
  nameFallback: NameFallback;
  excludeGlobal: boolean;
  groupBoost: number;
}

export function contextFromProfile(
  profile: UserProfile | null,
  fallback: { spaces: string; groups: string }
): SearchContext {
  if (profile) {
    return {
      readableSpaceIds: [
        ...profile.readableNonPodSpaces,
        ...profile.readablePodSpaces,
      ].map((space) => space.sId),
      userGroupIds: profile.groupIds,
      userEmail: profile.user.email,
    };
  }
  return {
    readableSpaceIds: fallback.spaces.split(",").filter(Boolean),
    userGroupIds: fallback.groups.split(",").filter(Boolean),
    userEmail: null,
  };
}

function buildSpaceAccessFilter(readableSpaceIds: string[]): EsQuery {
  if (readableSpaceIds.length === 0) {
    return { term: { requested_space_count: 0 } };
  }
  return {
    bool: {
      should: [
        { term: { requested_space_count: 0 } },
        {
          terms_set: {
            requested_space_ids: {
              terms: readableSpaceIds,
              minimum_should_match_field: "requested_space_count",
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

function buildVisibilityFilter(
  userEmail: string | null,
  excludeGlobal: boolean
): EsQuery {
  const visibleScopes = excludeGlobal ? ["visible"] : ["visible", "global"];
  const should: EsQuery[] = [{ terms: { scope: visibleScopes } }];
  if (userEmail) {
    should.push({
      bool: {
        filter: [
          { term: { scope: "hidden" } },
          { term: { editors: userEmail } },
        ],
      },
    });
  }
  return { bool: { should, minimum_should_match: 1 } };
}

function buildSubsequencePattern(term: string): string {
  const escaped = Array.from(term, (character) =>
    "\\*?".includes(character) ? `\\${character}` : character
  );
  return `*${escaped.join("*")}*`;
}

function supportsSubsequence(searchTerm: string): boolean {
  return (
    searchTerm.length <= MAX_SUBSEQUENCE_LENGTH && !/\s/.test(searchTerm)
  );
}

function buildTextClauses(
  searchTerm: string,
  includeInstructions: boolean,
  minShouldMatch: string,
  matchMode: MatchMode,
  nameFallback: NameFallback
): EsQuery[] {
  if (!searchTerm) {
    return [];
  }

  const fields = [
    "name^4",
    "description^2",
    ...(includeInstructions ? ["instructions"] : []),
  ];
  const shared = {
    query: searchTerm,
    fields,
    ...(minShouldMatch ? { minimum_should_match: minShouldMatch } : {}),
  };

  const weightedClause = { multi_match: { ...shared, type: "best_fields" } };
  const prefixClause = { multi_match: { ...shared, type: "bool_prefix" } };

  const matchClauses: EsQuery[] = {
    bool_prefix: [prefixClause],
    best_fields: [weightedClause],
    hybrid: [
      weightedClause,
      { multi_match: { ...shared, type: "bool_prefix", boost: PREFIX_CLAUSE_BOOST } },
    ],
  }[matchMode];

  if (!supportsSubsequence(searchTerm)) {
    return matchClauses;
  }

  const subsequenceClause = {
    wildcard: {
      "name.subsequence": {
        value: buildSubsequencePattern(searchTerm),
        case_insensitive: true,
        boost: NAME_FALLBACK_BOOST,
      },
    },
  };
  const fuzzyClause = {
    match: {
      name: {
        query: searchTerm,
        fuzziness: "AUTO",
        prefix_length: 1,
        boost: NAME_FALLBACK_BOOST,
      },
    },
  };

  return [
    ...matchClauses,
    ...{
      subsequence: [subsequenceClause],
      fuzzy: [fuzzyClause],
      both: [subsequenceClause, fuzzyClause],
      off: [],
    }[nameFallback],
  ];
}

// The weight has to live inside functions[]: a boost on the nested query is
// discarded when the inner function_score uses boost_mode "replace".
function buildGroupAdjacencyClause(
  userGroupIds: string[],
  groupBoost: number
): EsQuery[] {
  if (userGroupIds.length === 0) {
    return [];
  }
  return [
    {
      nested: {
        path: "usage.by_group",
        score_mode: "sum",
        query: {
          function_score: {
            query: { terms: { "usage.by_group.group_id": userGroupIds } },
            functions: [
              {
                field_value_factor: {
                  field: "usage.by_group.messages",
                  modifier: "log1p",
                  missing: 0,
                },
                weight: groupBoost,
              },
            ],
            score_mode: "multiply",
            boost_mode: "replace",
          },
        },
      },
    },
  ];
}

export function buildFilters(params: SearchParams): EsQuery[] {
  return [
    { term: { status: "active" } },
    buildSpaceAccessFilter(params.readableSpaceIds),
    ...(params.scopes.length > 0
      ? [{ terms: { scope: params.scopes } }]
      : [buildVisibilityFilter(params.userEmail, params.excludeGlobal)]),
  ];
}

export function buildAgentSearchQuery(params: SearchParams): EsQuery {
  const textClauses = buildTextClauses(
    params.searchTerm,
    params.includeInstructions,
    params.minShouldMatch,
    params.matchMode,
    params.nameFallback
  );
  const rankingClauses = buildGroupAdjacencyClause(
    params.userGroupIds,
    params.groupBoost
  );

  // Ranking clauses must never gate matching: with a `must` present, `should` defaults to
  // minimum_should_match 0 and only contributes score. Without that split, an agent with
  // any group usage matches every query, text match or not.
  return {
    bool: {
      filter: buildFilters(params),
      ...(textClauses.length > 0
        ? { must: [{ bool: { should: textClauses, minimum_should_match: 1 } }] }
        : {}),
      ...(rankingClauses.length > 0 ? { should: rankingClauses } : {}),
    },
  };
}
