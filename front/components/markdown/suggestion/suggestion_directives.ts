const CONVERSATION_AGENT_SUGGESTION_KINDS = [
  "create",
  "delete",
  "description",
  "instructions",
  "model",
  "name",
  "scope",
] as const;

export type ConversationAgentSuggestionKind =
  (typeof CONVERSATION_AGENT_SUGGESTION_KINDS)[number];

// `create` targets a not-yet-created placeholder agent, so there is no configuration to fetch.
export const DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS: ConversationAgentSuggestionKind[] =
  ["create"];

export function isConversationAgentSuggestionKind(
  kind: string
): kind is ConversationAgentSuggestionKind {
  return CONVERSATION_AGENT_SUGGESTION_KINDS.some((k) => k === kind);
}

const SUGGESTION_DIRECTIVE_REGEX =
  /:{1,2}(agent_suggestion|skill_suggestion)\[\]\{([^}]*)\}/g;

export type SuggestionPileDirective =
  | {
      type: "agent";
      sId: string;
      kind: ConversationAgentSuggestionKind;
      agentId: string;
    }
  | { type: "skill"; sId: string; skillId: string };

// Values may be double-quoted, single-quoted or bare, as the markdown directive parser accepts.
const ATTRIBUTE_REGEX = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s}"']+))/g;

function parseDirective(
  name: string,
  rawAttributes: string
): SuggestionPileDirective | null {
  const attributes = Object.fromEntries(
    [...rawAttributes.matchAll(ATTRIBUTE_REGEX)].map((m) => [
      m[1],
      m[2] ?? m[3] ?? m[4],
    ])
  );

  if (name === "agent_suggestion") {
    const { sId, kind, agentId } = attributes;
    return sId && agentId && kind && isConversationAgentSuggestionKind(kind)
      ? { type: "agent", sId, kind, agentId }
      : null;
  }

  const { sId, skillId } = attributes;
  return sId && skillId ? { type: "skill", sId, skillId } : null;
}

const MIN_PILE_SIZE = 2;

// Fenced blocks (closed or running to the end) and inline code spans render literally.
const CODE_REGEX = /(`{3,}|~{3,})[\s\S]*?(?:\1|$(?![\s\S]))|(`+)[\s\S]*?\2/g;

function replaceOutsideCode(
  content: string,
  pattern: RegExp,
  replacer: (match: string, ...groups: string[]) => string
): string {
  let result = "";
  let cursor = 0;
  for (const code of content.matchAll(CODE_REGEX)) {
    result += content.slice(cursor, code.index).replace(pattern, replacer);
    result += code[0];
    cursor = code.index + code[0].length;
  }
  return result + content.slice(cursor).replace(pattern, replacer);
}

const SUGGESTION_RECAP_REGEX =
  /:{1,2}suggestion_recap\[([^\]]*)\](\{[^}]*\})?/g;

export const MAX_SUGGESTION_RECAP_LENGTH = 140;

function capRecap(text: string): string {
  return text.length <= MAX_SUGGESTION_RECAP_LENGTH
    ? text
    : `${text.slice(0, MAX_SUGGESTION_RECAP_LENGTH - 1).trimEnd()}…`;
}

/**
 * @cc [owner:avervaet,label:product] pile-two-or-more-suggestions
 * Two or more complete suggestion directives MUST all move, in order, to `pileDirectives`; else none.
 * Directives inside code spans or fences are literal text: never counted nor removed.
 */
export function extractSuggestionPile(content: string): {
  content: string;
  pileDirectives: SuggestionPileDirective[];
  recap: string | null;
} {
  const recaps: string[] = [];
  const contentWithoutRecap = replaceOutsideCode(
    content,
    SUGGESTION_RECAP_REGEX,
    (_match, text: string) => {
      if (text.trim()) {
        recaps.push(text.trim());
      }
      return "";
    }
  );

  const pileDirectives: SuggestionPileDirective[] = [];
  const contentWithoutDirectives = replaceOutsideCode(
    contentWithoutRecap,
    SUGGESTION_DIRECTIVE_REGEX,
    (match, name: string, rawAttributes: string) => {
      const directive = parseDirective(name, rawAttributes);
      if (!directive) {
        return match;
      }
      pileDirectives.push(directive);
      return "";
    }
  );

  if (pileDirectives.length < MIN_PILE_SIZE) {
    return { content: contentWithoutRecap, pileDirectives: [], recap: null };
  }

  return {
    content: contentWithoutDirectives,
    pileDirectives,
    recap: recaps.length > 0 ? capRecap(recaps[0]) : null,
  };
}
