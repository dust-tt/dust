import type { EditorSuggestions } from "@app/ui/components/input_bar/editor/suggestion";
import { Extension } from "@tiptap/react";

// Storage extension to manage mention suggestions.
// This prevents content editable from re-rendering when suggestions change.
export const MentionStorage = Extension.create({
  name: "MentionStorage",

  addStorage() {
    return {
      suggestions: {} as EditorSuggestions,
    };
  },
});
