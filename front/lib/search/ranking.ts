import type { SearchMode } from "@app/types/search";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

// Fixed scores make indexed and code-defined skills comparable without corpus
// statistics. Keep the predicates and normalization identical on both sides.
const MATCH_SCORES = {
  exact: 100,
  prefix: 80,
  substring: 60,
  subsequence: 40,
  descriptionSubstring: 20,
  descriptionSubsequence: 10,
};

function escapeWildcard(value: string): string {
  return value.replace(/[\\*?]/g, "\\$&");
}

export function buildResourceMatchQuery(
  searchTerm: string,
  mode: SearchMode = "autocomplete"
): estypes.QueryDslQueryContainer {
  const query = searchTerm.trim();
  if (!query) {
    return { constant_score: { filter: { match_all: {} }, boost: 1 } };
  }
  const literal = escapeWildcard(query);
  const subsequence = `*${Array.from(query, escapeWildcard).join("*")}*`;
  const matches = [
    ["name.subsequence", literal, MATCH_SCORES.exact],
    ["name.subsequence", `${literal}*`, MATCH_SCORES.prefix],
    ["name.subsequence", `*${literal}*`, MATCH_SCORES.substring],
    ["name.subsequence", subsequence, MATCH_SCORES.subsequence],
    [
      "description.subsequence",
      `*${literal}*`,
      MATCH_SCORES.descriptionSubstring,
    ],
    [
      "description.subsequence",
      subsequence,
      MATCH_SCORES.descriptionSubsequence,
    ],
  ] as const;

  return {
    dis_max: {
      tie_breaker: 0,
      queries: matches
        .filter(
          ([field]) => mode !== "autocomplete" || field === "name.subsequence"
        )
        .map(([field, value, boost]) => ({
          constant_score: {
            filter: {
              wildcard: { [field]: { value, case_insensitive: true } },
            },
            boost,
          },
        })),
    },
  };
}

export function getResourceMatchScore({
  searchTerm,
  name,
  description = "",
  aliases = [],
  mode = "autocomplete",
}: {
  searchTerm: string;
  name: string;
  description?: string;
  aliases?: readonly string[];
  mode?: SearchMode;
}): number {
  // ES wildcard case_insensitive folds ASCII only (including on wildcard fields).
  const normalize = (value: string) =>
    value.replace(/[A-Z]/g, (character) => character.toLowerCase());
  const query = normalize(searchTerm.trim());
  if (!query) {
    return 1;
  }
  // Each scan moves forward, so repeated characters cannot cause backtracking.
  const isSubsequence = (value: string) => {
    let offset = 0;
    for (const character of query) {
      const found = value.indexOf(character, offset);
      if (found < 0) {
        return false;
      }
      offset = found + character.length;
    }
    return true;
  };

  let score = 0;
  for (const value of [name, ...aliases]) {
    const candidate = normalize(value);
    const candidateScore =
      candidate === query
        ? MATCH_SCORES.exact
        : candidate.startsWith(query)
          ? MATCH_SCORES.prefix
          : candidate.includes(query)
            ? MATCH_SCORES.substring
            : isSubsequence(candidate)
              ? MATCH_SCORES.subsequence
              : 0;
    score = Math.max(score, candidateScore);
  }
  return mode === "autocomplete"
    ? score
    : Math.max(
        score,
        normalize(description).includes(query)
          ? MATCH_SCORES.descriptionSubstring
          : isSubsequence(normalize(description))
            ? MATCH_SCORES.descriptionSubsequence
            : 0
      );
}

/**
 * @cc [owner:aubin-tchoi,label:product] shared-search-ranking
 * Indexed and code-defined results use the same mode, signals and float32 score;
 * autocomplete ignores description and usage, management sorts by usage then name.
 */
export function getSearchRankingScore({
  matchScore,
  mode,
  activeUsers = 0,
  feedbacks = 0,
}: {
  matchScore: number;
  mode: SearchMode;
  activeUsers?: number;
  feedbacks?: number;
}): number {
  if (matchScore <= 0) {
    return 0;
  }
  switch (mode) {
    case "autocomplete":
      return matchScore;
    case "management":
      return Math.fround(1 + activeUsers);
    case "discovery":
      return Math.fround(
        matchScore + Math.log1p(activeUsers) + Math.log1p(feedbacks)
      );
    default:
      return assertNever(mode);
  }
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
          script: { source: "1 + doc['active_users'].value" },
        },
      };
    case "discovery":
      return {
        script_score: {
          query,
          script: {
            source:
              "_score + Math.log1p(doc['active_users'].value) + (doc.containsKey('feedbacks') && doc['feedbacks'].size() > 0 ? Math.log1p(doc['feedbacks'].value) : 0)",
          },
        },
      };
    default:
      return assertNever(mode);
  }
}

export interface RankedResource {
  score: number;
  name: string;
  sId: string;
}

const encoder = new TextEncoder();

function compareUtf8Strings(a: string, b: string): number {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return left.length - right.length;
}

export function compareRankedResources(
  a: RankedResource,
  b: RankedResource
): number {
  // Keyword fields sort by UTF-8 bytes, not locale collation or UTF-16 units.
  return (
    Math.fround(b.score) - Math.fround(a.score) ||
    compareUtf8Strings(a.name, b.name) ||
    compareUtf8Strings(a.sId, b.sId)
  );
}
