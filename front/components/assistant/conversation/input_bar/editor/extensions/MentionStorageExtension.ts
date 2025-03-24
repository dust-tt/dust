import { Extension } from "@tiptap/react";

import type { EditorSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";

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
