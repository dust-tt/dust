import { Extension } from "@tiptap/core";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { Suggestion } from "@tiptap/suggestion";

export interface SkillSuggestionExtensionOptions {
  suggestion: Partial<SuggestionOptions>;
}

export const SkillSuggestionExtension =
  Extension.create<SkillSuggestionExtensionOptions>({
    name: "skillSuggestion",

    addOptions() {
      return {
        suggestion: {},
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
