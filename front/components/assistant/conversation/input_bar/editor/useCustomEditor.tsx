import Mention, { MentionPluginKey } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useMemo } from "react";

import type { EditorSuggestion } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { makeGetAssistantSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";

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
        editor
          ?.chain()
          .focus()
          .insertContent({
            type: "mention",
            attrs: { id, label },
          })
          .insertContent(" ") // Add an extra space after the mention.
          .run();
      },

      resetWithMentions: (mentions: EditorMention[]) => {
        const chainCommands = editor?.chain().focus().clearContent();

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
  suggestions: EditorSuggestion[];
  resetEditorContainerSize: () => void;
}

const useCustomEditor = ({
  onEnterKeyDown,
  resetEditorContainerSize,
  suggestions,
}: CustomEditorProps) => {
  // Memoize the suggestion configuration to avoid recreating the object on every render
  const getSuggestions = useMemo(
    () => makeGetAssistantSuggestions(suggestions),
    [suggestions]
  );

  const editor = useEditor(
    {
      autofocus: "end",
      enableInputRules: false, // Disable Markdown when typing.
      enablePasteRules: false, // Disable Markdown when pasting.
      extensions: [
        StarterKit.configure({
          heading: false,
        }),
        Mention.configure({
          HTMLAttributes: {
            class:
              "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-medium",
          },
          suggestion: getSuggestions,
        }),
        Placeholder.configure({
          placeholder: "Ask a question or get some @help",
          emptyNodeClass:
            "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:h-0",
        }),
      ],
    },
    [getSuggestions]
  );

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

          // Return true to indicate that this key event has been handled
          return true;
        }

        // Return false to let other keydown handlers or TipTap's default behavior process the event
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
