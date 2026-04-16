import type { Range } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export function getInputBarSkillSlashTrigger(state: EditorState): {
  query: string;
  range: Range;
} | null {
  const { empty, from, $from } = state.selection;

  if (!empty) {
    return null;
  }

  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "\ufffc"
  );
  const match = /(?:^|\s)\/([^\n]*)$/.exec(textBefore);

  if (!match) {
    return null;
  }

  const query = match[1];
  const slashLength = query.length + 1;
  const triggerStart = from - slashLength;

  return {
    query,
    range: {
      from: triggerStart,
      to: from,
    },
  };
}

export function getEditorViewRangeRect(view: EditorView, position: number) {
  const coordinates = view.coordsAtPos(position);

  return new DOMRect(
    coordinates.left,
    coordinates.top,
    coordinates.right - coordinates.left,
    coordinates.bottom - coordinates.top
  );
}
