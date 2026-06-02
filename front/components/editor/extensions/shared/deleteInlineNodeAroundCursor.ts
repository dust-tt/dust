import type { Editor } from "@tiptap/core";

export function deleteInlineNodeBeforeCursor(
  editor: Editor,
  nodeTypeName: string
) {
  return editor.commands.command(({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) {
      return false;
    }

    const nodeBefore = selection.$from.nodeBefore;
    if (!nodeBefore || nodeBefore.type.name !== nodeTypeName) {
      return false;
    }

    if (dispatch) {
      dispatch(
        state.tr.delete(
          selection.$from.pos - nodeBefore.nodeSize,
          selection.$from.pos
        )
      );
    }

    return true;
  });
}

export function deleteInlineNodeAfterCursor(
  editor: Editor,
  nodeTypeName: string
) {
  return editor.commands.command(({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) {
      return false;
    }

    const nodeAfter = selection.$from.nodeAfter;
    if (!nodeAfter || nodeAfter.type.name !== nodeTypeName) {
      return false;
    }

    if (dispatch) {
      dispatch(
        state.tr.delete(
          selection.$from.pos,
          selection.$from.pos + nodeAfter.nodeSize
        )
      );
    }

    return true;
  });
}
