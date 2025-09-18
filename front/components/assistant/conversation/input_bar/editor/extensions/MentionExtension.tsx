import type { NodeViewProps } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import type { PasteRuleMatch } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { nodePasteRule } from "@tiptap/react";
import escapeRegExp from "lodash/escapeRegExp";

import type { EditorSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import type { WorkspaceType } from "@app/types";

import { MentionComponent } from "../MentionComponent";

interface MentionExtensionOptions {
  owner: WorkspaceType;
}

export const MentionExtension = Mention.extend<MentionExtensionOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      owner: {} as WorkspaceType,
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <MentionComponent
        node={{ attrs: props.node.attrs as { id: string; label: string } }}
        owner={this.options.owner}
      />
    ));
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
                data: { id: suggestion.id, label: suggestion.label },
              };
            });
          }
        );
        return results;
      },
      type: this.type,
      getAttributes: (match: { data: { label: string; id: string } }) => {
        return { label: match.data.label, id: match.data.id };
      },
    });

    return [pasteRule];
  },
});
