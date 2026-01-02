import { Extension } from "@tiptap/core";
import type { SuggestionOptions } from "@tiptap/suggestion";
import Suggestion from "@tiptap/suggestion";

interface KnowledgeExtensionOptions {
  suggestion: Omit<SuggestionOptions, "editor">;
}

export const KnowledgeExtension = Extension.create<KnowledgeExtensionOptions>({
  name: "knowledge",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: null as any,
        render: () => ({
          onStart: () => {},
          onUpdate: () => {},
          onKeyDown: () => false,
          onExit: () => {},
        }),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
