import type { SearchMode } from "@app/types/api/skills";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

// Fixed scores make indexed and code-defined skills comparable without corpus
// statistics. Keep the predicates and normalization identical on both sides.
const MATCH_SCORES = {
  exact: 100,
  prefix: 80,
  name: 60,
  description: 20,
};

/**
 * @cc [owner:aubin-tchoi,label:product] skill-search-tokenization
 * Local tokenization must match skill_search_analyzer in the versioned ES settings,
 * including case boundaries, punctuation and Unicode simple lowercasing.
 */
function tokenize(value: string): string[] {
  // Lowercase each code point independently, like Lucene's lowercase filter.
  // U+0130 is the only JS lowercase expansion; Lucene maps it to plain "i".
  return value
    .split(
      /(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})|[^\p{L}\p{M}\p{N}]+/u
    )
    .filter(Boolean)
    .map((token) =>
      Array.from(token, (character) =>
        character === "\u0130" ? "i" : character.toLowerCase()
      ).join("")
    );
}

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
          term: { "name.keyword": { value: query, case_insensitive: true } },
        },
        boost: MATCH_SCORES.exact,
      },
    },
    {
      constant_score: {
        filter: {
          prefix: { "name.keyword": { value: query, case_insensitive: true } },
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

export function getSkillSearchScore({
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
  // Keyword term/prefix case_insensitive folds ASCII only.
  const normalize = (value: string) =>
    value.replace(/[A-Z]/g, (character) => character.toLowerCase());
  const query = normalize(searchTerm.trim());
  if (!query) {
    return 1;
  }
  const queryTokens = tokenize(searchTerm.trim());
  const lastToken = queryTokens.at(-1);
  const completeTokens = queryTokens.slice(0, -1);

  let score = 0;
  for (const value of [name, ...aliases]) {
    const candidate = normalize(value);
    const tokens = new Set(tokenize(value));
    const candidateScore =
      candidate === query
        ? MATCH_SCORES.exact
        : candidate.startsWith(query)
          ? MATCH_SCORES.prefix
          : lastToken &&
              completeTokens.every((token) => tokens.has(token)) &&
              [...tokens].some((token) => token.startsWith(lastToken))
            ? MATCH_SCORES.name
            : 0;
    score = Math.max(score, candidateScore);
  }
  if (mode === "autocomplete" || queryTokens.length === 0) {
    return score;
  }
  const descriptionTokens = new Set(tokenize(description));
  return Math.max(
    score,
    queryTokens.every((token) => descriptionTokens.has(token))
      ? MATCH_SCORES.description
      : 0
  );
}

/**
 * @cc [owner:aubin-tchoi,label:product] skill-search-ranking
 * Indexed and code-defined results use the same mode, signals and float32 score;
 * autocomplete ignores description and usage, management sorts by usage then name.
 */
export function getSearchRankingScore({
  matchScore,
  mode,
  activeUsers = 0,
}: {
  matchScore: number;
  mode: SearchMode;
  activeUsers?: number;
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
      return Math.fround(matchScore + Math.log1p(activeUsers));
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
            source: "_score + Math.log1p(doc['active_users'].value)",
          },
        },
      };
    default:
      return assertNever(mode);
  }
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
    Math.fround(b.score) - Math.fround(a.score) ||
    compareUtf8Strings(a.name, b.name) ||
    compareUtf8Strings(a.sId, b.sId)
  );
}
