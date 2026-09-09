import { subFilter } from "@app/lib/utils";
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

// Exclusive end index of the words `queryWord` covers from `start`: a prefix of one word, or of
// consecutive words joined ("gpt6" covers "GPT 6"). Null when it covers none.
function getMatchedSpanEnd(
  queryWord: string,
  words: string[],
  start: number
): number | null {
  let joined = "";
  for (let end = start; end < words.length; end++) {
    joined += words[end];
    if (joined.startsWith(queryWord)) {
      return end + 1;
    }
    if (!queryWord.startsWith(joined)) {
      return null;
    }
  }

  return null;
}

// Backtracking over a handful of words per side, so the search space is tiny.
function matchesDistinctWords(queryWords: string[], words: string[]): boolean {
  const [queryWord, ...rest] = queryWords;
  if (queryWord === undefined) {
    return true;
  }

  return words.some((_, start) => {
    const end = getMatchedSpanEnd(queryWord, words, start);
    return (
      end !== null &&
      matchesDistinctWords(rest, [
        ...words.slice(0, start),
        ...words.slice(end),
      ])
    );
  });
}

/**
 * @cc [owner:PopDaph,label:product] query-words-prefix-match
 * Returns true only if every word of `query` is a case-insensitive prefix of one word of `text`
 * or of consecutive words of `text` joined without separator, each `text` word being covered by
 * at most one query word (both split on whitespace and hyphens); an empty `query` always matches.
 */
export function matchesSearchWords(text: string, query: string): boolean {
  return matchesDistinctWords(splitSearchWords(query), splitSearchWords(text));
}

/**
 * @cc [owner:PopDaph,label:product] loose-match-only-when-word-starts-nothing
 * A query word is matched as a word prefix (`matchesSearchWords`) when it prefixes a word of at
 * least one item's text, otherwise as an in-order subsequence (`subFilter`) of the item's text.
 * An item is kept only if every query word matches it in its mode; an empty query keeps every item.
 */
export function filterBySearchWords<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): T[] {
  const queryWords = splitSearchWords(query);
  if (queryWords.length === 0) {
    return items;
  }

  const entries = items.map((item) => ({
    item,
    words: splitSearchWords(getText(item)),
  }));
  const strictWords = queryWords.filter((queryWord) =>
    entries.some(({ words }) => matchesDistinctWords([queryWord], words))
  );
  const looseWords = queryWords.filter(
    (queryWord) => !strictWords.includes(queryWord)
  );

  return entries
    .filter(
      ({ words }) =>
        matchesDistinctWords(strictWords, words) &&
        looseWords.every((queryWord) => subFilter(queryWord, words.join(" ")))
    )
    .map(({ item }) => item);
}

/** Keeps slash dropdown height stable so Radix placement does not jump with few items. */
export const SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME = "min-h-48 max-h-96";

export const SLASH_COMMAND_DEFAULT_LOADING_MESSAGE = "Loading…";

export const SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE =
  "Loading capabilities…";

export function getAttachContextSlashMenuLoadingMessage(includeFiles: boolean) {
  return includeFiles ? "Searching…" : "Searching knowledge…";
}
