const CONVERSATION_AGENT_SUGGESTION_KINDS = [
  "create",
  "delete",
  "description",
  "instructions",
  "model",
  "name",
  "scope",
  "skills",
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

const BATCH_DIRECTIVE_REGEX = /:{1,2}batch_edit\[\]\{([^}]*)\}/g;

// Values may be double-quoted, single-quoted or bare, as the markdown directive parser accepts.
const ATTRIBUTE_REGEX = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s}"']+))/g;

function parseBatchId(rawAttributes: string): string | null {
  const attributes = Object.fromEntries(
    [...rawAttributes.matchAll(ATTRIBUTE_REGEX)].map((m) => [
      m[1],
      m[2] ?? m[3] ?? m[4],
    ])
  );
  return attributes.sId || null;
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
 * Two or more batch directives carrying distinct batch ids MUST all move, in order and without
 * repeats, to `pileBatchIds`; else none. Directives inside code spans or fences are literal text:
 * never counted nor removed.
 */
export function extractSuggestionPile(content: string): {
  content: string;
  pileBatchIds: string[];
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

  const pileBatchIds: string[] = [];
  const contentWithoutDirectives = replaceOutsideCode(
    contentWithoutRecap,
    BATCH_DIRECTIVE_REGEX,
    (match, rawAttributes: string) => {
      const batchId = parseBatchId(rawAttributes);
      if (!batchId) {
        return match;
      }
      if (!pileBatchIds.includes(batchId)) {
        pileBatchIds.push(batchId);
      }
      return "";
    }
  );

  if (pileBatchIds.length < MIN_PILE_SIZE) {
    return { content: contentWithoutRecap, pileBatchIds: [], recap: null };
  }

  return {
    content: contentWithoutDirectives,
    pileBatchIds,
    recap: recaps.length > 0 ? capRecap(recaps[0]) : null,
  };
}
