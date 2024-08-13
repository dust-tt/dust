import Mention, { MentionPluginKey } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent, PasteRuleMatch } from "@tiptap/react";
import { nodePasteRule, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { escapeRegExp } from "lodash";
import { useEffect, useMemo } from "react";

import { MentionStorage } from "@app/components/assistant/conversation/input_bar/editor/MentionStorage";
import type { EditorSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { makeGetAssistantSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { ParagraphExtension } from "@app/components/text_editor/extensions";

export interface EditorMention {
  id: string;
  label: string;
}

function getTextAndMentionsFromNode(node?: JSONContent) {
  let textContent = "";
  let mentions: EditorMention[] = [];

  if (!node) {
    return { mentions, text: textContent };
  }

  // Check if the node is of type 'text' and concatenate its text.
  if (node.type === "text") {
    textContent += node.text;
  }

  // If the node is a 'mention', concatenate the mention label and add to mentions array.
  if (node.type === "mention") {
    // TODO: We should not expose `sId` here.
    textContent += `:mention[${node.attrs?.label}]{sId=${node.attrs?.id}}`;
    mentions.push({
      id: node.attrs?.id,
      label: node.attrs?.label,
    });
  }

  // If the node is a 'hardBreak' or a 'paragraph', add a newline character.
  if (node.type && ["hardBreak", "paragraph"].includes(node.type)) {
    textContent += "\n";
  }

  // If the node has content, recursively get text and mentions from each child node
  if (node.content) {
    node.content.forEach((childNode) => {
      const childResult = getTextAndMentionsFromNode(childNode);
      textContent += childResult.text;
      mentions = mentions.concat(childResult.mentions);
    });
  }

  return { text: textContent, mentions: mentions };
}

const useEditorService = (editor: Editor | null) => {
  const editorService = useMemo(() => {
    // Return the service object with utility functions
    return {
      // Insert mention helper function
      insertMention: ({ id, label }: { id: string; label: string }) => {
        const shouldAddSpaceBeforeMention =
          !editor?.isEmpty &&
          editor?.getText()[editor?.getText().length - 1] !== " ";
        editor
          ?.chain()
          .focus()
          .insertContent(shouldAddSpaceBeforeMention ? " " : "") // Add an extra space before the mention.
          .insertContent({
            type: "mention",
            attrs: { id, label },
          })
          .insertContent(" ") // Add an extra space after the mention.
          .run();
      },

      resetWithMentions: (
        mentions: EditorMention[],
        disableAutoFocus: boolean
      ) => {
        const chainCommands = editor?.chain();

        if (!disableAutoFocus) {
          chainCommands?.focus();
        }

        chainCommands?.clearContent();

        mentions.forEach(
          (m) =>
            chainCommands
              ?.insertContent({
                type: "mention",
                attrs: m,
              })
              .insertContent(" ") // Add an extra space after the mention.
        );

        chainCommands?.run();
      },

      focusEnd() {
        editor?.commands.focus("end");
      },

      isEmpty() {
        return editor?.isEmpty ?? true;
      },

      getJSONContent() {
        return editor?.getJSON();
      },

      getTextAndMentions() {
        const { mentions, text } = getTextAndMentionsFromNode(
          editor?.getJSON()
        );

        return {
          mentions,
          text: text.trim(),
        };
      },

      hasMention(mention: EditorMention) {
        const { mentions } = this.getTextAndMentions();
        return mentions.some((m) => m.id === mention.id);
      },

      getTrimmedText() {
        return editor?.getText().trim();
      },

      clearEditor() {
        return editor?.commands.clearContent();
      },
    };
  }, [editor]);

  return editorService;
};

export type EditorService = ReturnType<typeof useEditorService>;

export interface CustomEditorProps {
  onEnterKeyDown: (
    isEmpty: boolean,
    textAndMentions: ReturnType<typeof getTextAndMentionsFromNode>,
    clearEditor: () => void
  ) => void;
  suggestions: EditorSuggestions;
  resetEditorContainerSize: () => void;
  disableAutoFocus: boolean;
}

const CustomMention = Mention.extend({
  addPasteRules() {
    const pasteRule = nodePasteRule({
      find: (text) => {
        const suggestions: EditorSuggestions =
          this.editor.storage.MentionStorage.suggestions;

        // The suggestions object should be available from the MentionStorage extension but it might takes some time to load.
        if (!suggestions) {
          return null;
        }

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

const useCustomEditor = ({
  onEnterKeyDown,
  resetEditorContainerSize,
  suggestions,
  disableAutoFocus,
}: CustomEditorProps) => {
  const editor = useEditor({
    autofocus: disableAutoFocus ? false : "end",
    enableInputRules: false, // Disable Markdown when typing.
    enablePasteRules: [CustomMention.name], // We don't want Markdown when pasting but we allow CustomMention extension as it will handle parsing @assistant-name from plain text back into a mention.
    extensions: [
      StarterKit.configure({
        heading: false,
        // Disable the paragraph extension to handle Enter key press manually.
        paragraph: false,
      }),
      ParagraphExtension,
      MentionStorage,
      CustomMention.configure({
        HTMLAttributes: {
          class:
            "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-medium",
        },
        suggestion: makeGetAssistantSuggestions(),
      }),
      Placeholder.configure({
        placeholder: "Ask a question or get some @help",
        emptyNodeClass:
          "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:h-0",
      }),
    ],
  });

  // Sync the extension's MentionStorage suggestions whenever the local suggestions state updates.
  useEffect(() => {
    if (editor) {
      editor.storage.MentionStorage.suggestions = suggestions;
    }
  }, [suggestions, editor]);

  editor?.setOptions({
    editorProps: {
      attributes: {
        class: "border-0 outline-none overflow-y-auto h-full scrollbar-hide",
      },
      handleKeyDown: (view, event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          const mentionPluginState = MentionPluginKey.getState(view.state);
          // Let the mention extension handle the event if its dropdown is currently opened.
          if (mentionPluginState?.active) {
            return false;
          }

          // Prevent the default Enter key behavior
          event.preventDefault();

          const clearEditor = () => {
            editor.commands.clearContent();
            resetEditorContainerSize();
          };

          onEnterKeyDown(
            editor.isEmpty,
            getTextAndMentionsFromNode(editor.getJSON()),
            clearEditor
          );

          // Return true to indicate that this key event has been handled.
          return true;
        }

        // Return false to let other keydown handlers or TipTap's default behavior process the event.
        return false;
      },
    },
  });

  const editorService = useEditorService(editor);

  // Expose the editor instance and the editor service.
  return {
    editor,
    editorService,
  };
};

export default useCustomEditor;
