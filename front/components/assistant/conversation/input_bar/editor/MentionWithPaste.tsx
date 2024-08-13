import Mention from "@tiptap/extension-mention";
import type { PasteRuleMatch } from "@tiptap/react";
import { nodePasteRule } from "@tiptap/react";
import { escapeRegExp } from "lodash";

import type { EditorSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";

export const MentionWithPaste = Mention.extend({
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
                new RegExp(escapeRegExp("@" + suggestion.label), "g")
              ),
            ].map((match) => {
              return {
                index: match.index,
                text: match[0],
                replaceWith: suggestion.label,
                data: { id: suggestion.id, label: suggestion.label },
              };
            });
          }
        );
        return results;
      },
      type: this.type,
      getAttributes: (match: Record<string, any>) => {
        return { label: match.data["label"], id: match.data["id"] };
      },
    });

    return [pasteRule];
  },
});
