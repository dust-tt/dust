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

/** Keeps slash dropdown height stable so Radix placement does not jump with few items. */
export const SLASH_COMMAND_DROPDOWN_LIST_CLASS_NAME = "min-h-48 max-h-96";

/**
 * Text to insert at the cursor to open the slash dropdown programmatically. The
 * suggestion plugin only activates a "/" preceded by a space or at the start of
 * a text block, so a leading space is added when needed.
 */
export function getSlashTriggerText(state: EditorState): string {
  const { nodeBefore } = state.selection.$from;
  const needsLeadingSpace =
    nodeBefore !== null &&
    (!nodeBefore.isText || !(nodeBefore.text ?? "").endsWith(" "));

  return needsLeadingSpace ? " /" : "/";
}
