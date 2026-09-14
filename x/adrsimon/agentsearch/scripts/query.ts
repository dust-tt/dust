import { esRequest } from "./es.ts";
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
  readableNonPodSpaceIds: string[];
  readablePodSpaceIds: string[];
  userGroupIds: string[];
  userEmail: string | null;
}

export interface ReferencedSpaces {
  nonPodSpaceIds: string[];
  podSpaceIds: string[];
}

export interface SearchParams extends SearchContext {
  searchTerm: string;
  includeInstructions: boolean;
  minShouldMatch: string;
  matchMode: MatchMode;
  nameFallback: NameFallback;
  excludeGlobal: boolean;
  groupBoost: number;
  referencedSpaces: ReferencedSpaces;
}

export function contextFromProfile(
  profile: UserProfile | null,
  fallback: { spaces: string; groups: string }
): SearchContext {
  if (profile) {
    return {
      readableNonPodSpaceIds: profile.readableNonPodSpaces.map(
        (space) => space.sId
      ),
      readablePodSpaceIds: profile.readablePodSpaces.map((space) => space.sId),
      userGroupIds: profile.groupIds,
      userEmail: profile.user.email,
    };
  }
  return {
    readableNonPodSpaceIds: fallback.spaces.split(",").filter(Boolean),
    readablePodSpaceIds: [],
    userGroupIds: fallback.groups.split(",").filter(Boolean),
    userEmail: null,
  };
}

// `terms_set` is the literal translation of `filterAgentsByRequestedSpaces` — every requested
// space readable — but it expands to one Lucene clause per term, so its ceiling is
// `maxClauseCount`: 1024 at the floor, derived per node from heap and CPU above it. Its
// contrapositive, `must_not` a `terms` list of the spaces the caller cannot read, is the same
// predicate in a single `TermInSetQuery` and runs to `index.max_terms_count`.
//
// Neither side is bounded on its own. A workspace can reference thousands of pods, and a user can
// belong to thousands. What is small is one of the two, per space class: send whichever side is
// shorter, and only take the positive form while it fits the clause budget.
const MAX_TERMS_SET_TERMS = 1024;

export function buildSpaceClassFilter(
  spaceIdsField: string,
  spaceCountField: string,
  readableSpaceIds: string[],
  referencedSpaceIds: string[]
): EsQuery {
  const readableSpaceIdSet = new Set(readableSpaceIds);
  const deniedSpaceIds = referencedSpaceIds.filter(
    (spaceId) => !readableSpaceIdSet.has(spaceId)
  );
  if (deniedSpaceIds.length === 0) {
    return { match_all: {} };
  }

  const grantingSpaceIds = referencedSpaceIds.filter((spaceId) =>
    readableSpaceIdSet.has(spaceId)
  );
  if (grantingSpaceIds.length === 0) {
    return { term: { [spaceCountField]: 0 } };
  }
  if (
    grantingSpaceIds.length >
    Math.min(deniedSpaceIds.length, MAX_TERMS_SET_TERMS)
  ) {
    return {
      bool: { must_not: [{ terms: { [spaceIdsField]: deniedSpaceIds } }] },
    };
  }
  return {
    bool: {
      should: [
        { term: { [spaceCountField]: 0 } },
        {
          terms_set: {
            [spaceIdsField]: {
              terms: grantingSpaceIds,
              minimum_should_match_field: spaceCountField,
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

// Pods and non-pods are filtered apart because their bounds are unrelated: non-pod spaces are
// bounded by the workspace, pod membership by the caller. An agent is visible when both hold, so
// the two clauses are ANDed, which is what `canReadRequestedSpaces` does term by term.
function buildSpaceAccessFilter(params: SearchParams): EsQuery[] {
  return [
    buildSpaceClassFilter(
      "non_pod_space_ids",
      "non_pod_space_count",
      params.readableNonPodSpaceIds,
      params.referencedSpaces.nonPodSpaceIds
    ),
    buildSpaceClassFilter(
      "pod_space_ids",
      "pod_space_count",
      params.readablePodSpaceIds,
      params.referencedSpaces.podSpaceIds
    ),
  ];
}

interface ReferencedSpacesResponse {
  aggregations: Record<
    string,
    { sum_other_doc_count: number; buckets: { key: string }[] }
  >;
}

const MAX_REFERENCED_SPACES = 20000;

// The spaces agents actually point at, the only ones that can change the answer. In front, a
// cached `SELECT DISTINCT unnest("requestedSpaceIds")` over the workspace's active agents.
// Over-listing this set is harmless; under-listing it leaks.
export async function fetchReferencedSpaces(
  esUrl: string,
  index: string
): Promise<ReferencedSpaces> {
  const aggFor = (field: string) => ({
    terms: { field, size: MAX_REFERENCED_SPACES },
  });
  const result = await esRequest<ReferencedSpacesResponse>(
    esUrl,
    "POST",
    `/${index}/_search`,
    JSON.stringify({
      size: 0,
      query: { term: { status: "active" } },
      aggs: {
        non_pod_space_ids: aggFor("non_pod_space_ids"),
        pod_space_ids: aggFor("pod_space_ids"),
      },
    })
  );
  const spaceIdsOf = (field: string) => {
    const agg = result.aggregations[field];
    if (agg.sum_other_doc_count > 0) {
      throw new Error(
        `agents reference more than ${MAX_REFERENCED_SPACES} ${field}; the filter would be incomplete`
      );
    }
    return agg.buckets.map((bucket) => bucket.key);
  };
  return {
    nonPodSpaceIds: spaceIdsOf("non_pod_space_ids"),
    podSpaceIds: spaceIdsOf("pod_space_ids"),
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
    ...buildSpaceAccessFilter(params),
    buildVisibilityFilter(params.userEmail, params.excludeGlobal),
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
