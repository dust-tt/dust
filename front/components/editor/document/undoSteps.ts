import type { Editor } from "@tiptap/core";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import { UndoManager } from "yjs";

// The collaboration history merges edits made within half a second into one undo step.
export const asOwnUndoStep = (editor: Editor, edit: () => void) => {
  const undoManager: unknown = yUndoPluginKey.getState(
    editor.state
  )?.undoManager;
  const stopCapturing = () => {
    if (undoManager instanceof UndoManager) {
      undoManager.stopCapturing();
    }
  };
  stopCapturing();
  edit();
  stopCapturing();
};
