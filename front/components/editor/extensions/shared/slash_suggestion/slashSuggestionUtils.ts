import type { Range } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export function hasSlashCharacterAtPosition(
  state: EditorState,
  position: number
) {
  const docSize = state.doc.content.size;

  if (position < 1 || position > docSize) {
    return false;
  }

  return (
    state.doc.textBetween(
      position,
      Math.min(position + 1, docSize + 1),
      undefined,
      "\ufffc"
    ) === "/"
  );
}

export function isAllowedSlashQuery(state: EditorState, range: Range) {
  const text = state.doc.textBetween(range.from, range.to, undefined, "\ufffc");

  if (!text.startsWith("/")) {
    return false;
  }

  return !text.slice(1).startsWith(" ");
}

export function splitSearchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((word) => word.length > 0);
}

// Backtracking over a handful of words per side, so the search space is tiny.
function matchesDistinctWords(queryWords: string[], words: string[]): boolean {
  const [queryWord, ...rest] = queryWords;
  if (queryWord === undefined) {
    return true;
  }

  return words.some(
    (word, index) =>
      word.startsWith(queryWord) &&
      matchesDistinctWords(
        rest,
        words.filter((_, wordIndex) => wordIndex !== index)
      )
  );
}

/**
 * @cc [owner:PopDaph,label:product] query-words-prefix-match
 * Returns true only if every word of `query` is a case-insensitive prefix of a distinct word of
 * `text` (both split on whitespace and hyphens); an empty `query` always matches.
 */
export function matchesSearchWords(text: string, query: string): boolean {
  return matchesDistinctWords(splitSearchWords(query), splitSearchWords(text));
}

/** Keeps slash dropdown height stable so Radix placement does not jump with few items. */
export const SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME = "min-h-48 max-h-96";

export const SLASH_COMMAND_DEFAULT_LOADING_MESSAGE = "Loading…";

export const SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE =
  "Loading capabilities…";

export function getAttachContextSlashMenuLoadingMessage(includeFiles: boolean) {
  return includeFiles ? "Searching…" : "Searching knowledge…";
}
