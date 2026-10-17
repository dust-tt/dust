import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";

// `editor.isEditable` read during render goes stale: tiptap does not re-render React node views
// when `setEditable` toggles. Subscribe to the editor instead.
export function useIsEditorEditable(editor: Editor): boolean {
  return useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor.isEditable,
  });
}
