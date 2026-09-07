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

export function buildSkillMatchQuery(
  searchTerm: string
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
      "user_facing_description.subsequence",
      `*${literal}*`,
      MATCH_SCORES.descriptionSubstring,
    ],
    [
      "user_facing_description.subsequence",
      subsequence,
      MATCH_SCORES.descriptionSubsequence,
    ],
  ] as const;

  return {
    dis_max: {
      tie_breaker: 0,
      queries: matches.map(([field, value, boost]) => ({
        constant_score: {
          filter: { wildcard: { [field]: { value, case_insensitive: true } } },
          boost,
        },
      })),
    },
  };
}

export function getSkillSearchScore({
  searchTerm,
  name,
  description = "",
  aliases = [],
}: {
  searchTerm: string;
  name: string;
  description?: string;
  aliases?: readonly string[];
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
  return Math.max(
    score,
    normalize(description).includes(query)
      ? MATCH_SCORES.descriptionSubstring
      : isSubsequence(normalize(description))
        ? MATCH_SCORES.descriptionSubsequence
        : 0
  );
}

export interface RankedSkill {
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

export function compareRankedSkills(a: RankedSkill, b: RankedSkill): number {
  // Keyword fields sort by UTF-8 bytes, not locale collation or UTF-16 units.
  return (
    b.score - a.score ||
    compareUtf8Strings(a.name, b.name) ||
    compareUtf8Strings(a.sId, b.sId)
  );
}
