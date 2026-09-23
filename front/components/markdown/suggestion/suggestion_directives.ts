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

function parseDirective(
  name: string,
  rawAttributes: string
): SuggestionPileDirective | null {
  const attributes = Object.fromEntries(
    [...rawAttributes.matchAll(/(\w+)=([^\s}]+)/g)].map((m) => [m[1], m[2]])
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
 * When `content` holds at least two suggestion directives carrying every identifier their
 * conversational card needs, all of them MUST be removed from the returned `content` and returned
 * in `pileDirectives` in order of appearance. Otherwise no suggestion directive is removed and
 * `pileDirectives` is empty. Directives missing an identifier MUST never be removed.
 */
/**
 * @cc [owner:avervaet,label:product] recap-from-message
 * Recap directives MUST always be removed from the returned `content`, pile or not. `recap` is the
 * first non-empty one, capped to `MAX_SUGGESTION_RECAP_LENGTH` characters, and MUST be `null`
 * when there is no pile.
 */
export function extractSuggestionPile(content: string): {
  content: string;
  pileDirectives: SuggestionPileDirective[];
  recap: string | null;
} {
  const recaps: string[] = [];
  const contentWithoutRecap = content.replace(
    SUGGESTION_RECAP_REGEX,
    (_match, text: string) => {
      if (text.trim()) {
        recaps.push(text.trim());
      }
      return "";
    }
  );

  const pileDirectives: SuggestionPileDirective[] = [];
  const contentWithoutDirectives = contentWithoutRecap.replace(
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
