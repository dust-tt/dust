import type { NodeViewProps } from "@tiptap/core";
import type { MentionOptions } from "@tiptap/extension-mention";
import Mention from "@tiptap/extension-mention";
import { TextSelection } from "@tiptap/pm/state";
import type { PasteRuleMatch } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { nodePasteRule } from "@tiptap/react";
import escapeRegExp from "lodash/escapeRegExp";

import type { EditorSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import type { WorkspaceType } from "@app/types";

import { MentionComponent } from "../MentionComponent";

interface MentionExtensionOptions extends MentionOptions {
  owner?: WorkspaceType;
}

export const MentionExtension = Mention.extend<MentionExtensionOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
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

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <MentionComponent
        node={{
          attrs: props.node.attrs as {
            id: string;
            label: string;
            description?: string;
          },
        }}
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
      getAttributes: (match: {
        data: { label: string; id: string; description: string };
      }) => {
        return {
          label: match.data.label,
          id: match.data.id,
          description: match.data.description,
        };
      },
    });

    return [pasteRule];
  },

  // Override Backspace behavior so it removes a single character from the
  // mention label and converts the chip back to typed text (which re-triggers
  // the @-suggestion dropdown).
  addKeyboardShortcuts() {
    return {
      ...(this.parent?.() ?? {}),
      Backspace: () =>
        this.editor.commands.command(({ tr, state, dispatch }) => {
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          let handled = false;

          // Look for a mention node immediately before the caret.
          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              handled = true;
              const trigger = this.options.suggestion?.char ?? "@";
              const label: string = node.attrs?.label ?? node.attrs?.id ?? "";

              // Compose the raw text form and remove one character from the end.
              const raw = `${trigger}${label}`;
              const next = raw.length > 1 ? raw.slice(0, -1) : trigger;

              tr.insertText(next, pos, pos + node.nodeSize);

              // Place the caret at the end of the inserted text (before any trailing space node).
              const selPos = pos + next.length;
              tr.setSelection(TextSelection.create(tr.doc, selPos));

              if (dispatch) {
                dispatch(tr);
              }

              // Stop scanning further.
              return false;
            }
            return undefined;
          });

          return handled;
        }),
    };
  },
});
