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

export function shouldInsertSlashBoundarySpace(state: EditorState) {
  const textBefore = state.selection.$from.nodeBefore?.isText
    ? state.selection.$from.nodeBefore.text
    : null;

  return !!textBefore && !textBefore.endsWith(" ");
}

/** Keeps slash dropdown height stable so Radix placement does not jump with few items. */
export const SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME = "min-h-48 max-h-96";

export const SLASH_COMMAND_DEFAULT_LOADING_MESSAGE = "Loading…";

export const SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE =
  "Loading capabilities…";

export function getAttachContextSlashMenuLoadingMessage(includeFiles: boolean) {
  return includeFiles ? "Searching…" : "Searching knowledge…";
}
