import type { EditorSuggestions } from "@app/ui/components/input_bar/editor/suggestion";
import { Extension } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Storage {
    MentionStorage: {
      suggestions: EditorSuggestions;
    };
  }
}
// Storage extension to manage mention suggestions.
// This prevents content editable from re-rendering when suggestions change.
export const MentionStorageExtension = Extension.create({
  name: "MentionStorage",

  addStorage() {
    return {
      suggestions: {} as EditorSuggestions,
    };
  },
});
