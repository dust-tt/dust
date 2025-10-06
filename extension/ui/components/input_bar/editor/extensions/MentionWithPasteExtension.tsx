import type { EditorSuggestions } from "@app/ui/components/input_bar/editor/suggestion";
import Mention from "@tiptap/extension-mention";
import type { PasteRuleMatch } from "@tiptap/react";
import { nodePasteRule } from "@tiptap/react";

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const MentionWithPasteExtension = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Add description attribute to store agent description for tooltip display
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-description"),
        renderHTML: (attributes) => {
          if (!attributes.description) {
            return {};
          }
          return {
            "data-description": attributes.description,
          };
        },
      },
    };
  },

  addPasteRules() {
    const pasteRule = nodePasteRule({
      find: (text) => {
        // Note The suggestions object should be available from the MentionStorage extension but it might takes some time to load.
        const suggestions: EditorSuggestions =
          this.editor.storage.MentionStorage.suggestions;

        const results: PasteRuleMatch[] = suggestions.suggestions.flatMap(
          (suggestion) => {
            return [
              ...text.matchAll(
                // Note: matching the @ that are found either at the start of a line or after a whitespace character.
                // and that also are followed by a newline, a whitespace character or the end of the string.
                new RegExp(
                  `((^@|\\s@)${escapeRegExp(suggestion.label)})(\\s|$)`,
                  "g"
                )
              ),
            ].map((match) => {
              return {
                index: match.index,
                text: match[1],
                replaceWith: suggestion.label,
                data: {
                  id: suggestion.id,
                  label: suggestion.label,
                  description: suggestion.description,
                },
              };
            });
          }
        );
        return results;
      },
      type: this.type,
      getAttributes: (match: Record<string, any>) => {
        return {
          label: match.data["label"],
          id: match.data["id"],
          description: match.data["description"],
        };
      },
    });

    return [pasteRule];
  },
});
