import { DataSourceLinkExtension } from "@app/ui/components/input_bar/editor/extensions/DataSourceLinkExtension";
import { MarkdownStyleExtension } from "@app/ui/components/input_bar/editor/extensions/MarkdownStyleExtension";
import { MentionStorageExtension } from "@app/ui/components/input_bar/editor/extensions/MentionStorageExtension";
import { MentionWithPasteExtension } from "@app/ui/components/input_bar/editor/extensions/MentionWithPasteExtension";
import { URLDetectionExtension } from "@app/ui/components/input_bar/editor/extensions/URLDetectionExtension";
import { URLStorageExtension } from "@app/ui/components/input_bar/editor/extensions/URLStorageExtension";
import { createMarkdownSerializer } from "@app/ui/components/input_bar/editor/markdownSerializer";
import type { EditorSuggestions } from "@app/ui/components/input_bar/editor/suggestion";
import { makeGetAssistantSuggestions } from "@app/ui/components/input_bar/editor/suggestion";
import { MentionPluginKey } from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useMemo } from "react";
import { NodeCandidate, UrlCandidate } from "@app/shared/lib/connectors";

const ParagraphExtension = Paragraph.extend({
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => this.editor.commands.splitBlock(),
    };
  },
});

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
  const markdownSerializer = useMemo(() => {
    if (!editor?.schema) {
      return null;
    }

    return createMarkdownSerializer(editor.schema);
  }, [editor]);

  const editorService = useMemo(() => {
    // Return the service object with utility functions.
    return {
      // Insert mention helper function.
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

      getMarkdownAndMentions() {
        if (!editor?.state.doc) {
          return {
            markdown: "",
            mentions: [],
          };
        }

        return {
          markdown: markdownSerializer?.serialize(editor.state.doc) ?? "",
          mentions: this.getTextAndMentions().mentions,
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

      setLoading(loading: boolean) {
        if (loading) {
          editor?.view.dom.classList.add("loading-text");
        } else {
          editor?.view.dom.classList.remove("loading-text");
        }
        return editor?.setEditable(!loading);
      },
    };
  }, [editor, markdownSerializer]);

  return editorService;
};

export type EditorService = ReturnType<typeof useEditorService>;

export interface CustomEditorProps {
  onEnterKeyDown: (
    isEmpty: boolean,
    markdownAndMentions: ReturnType<
      ReturnType<typeof useEditorService>["getMarkdownAndMentions"]
    >,
    clearEditor: () => void,
    setLoading: (loading: boolean) => void
  ) => void;
  suggestions: EditorSuggestions;
  disableAutoFocus: boolean;
  onUrlDetected?: (candidate: UrlCandidate | NodeCandidate) => void;
}

const useCustomEditor = ({
  onEnterKeyDown,
  suggestions,
  disableAutoFocus,
  onUrlDetected,
}: CustomEditorProps) => {
  const extensions = [
    StarterKit.configure({
      hardBreak: false, // Disable the built-in Shift+Enter.
      paragraph: false,
      strike: false,
    }),
    MentionStorageExtension,
    DataSourceLinkExtension,
    MentionWithPasteExtension.configure({
      HTMLAttributes: {
        class:
          "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-semibold",
      },
      suggestion: makeGetAssistantSuggestions(),
    }),
    Placeholder.configure({
      placeholder: "Ask a question or get some @help",
      emptyNodeClass:
        "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:h-0",
    }),
    MarkdownStyleExtension,
    ParagraphExtension,
    URLStorageExtension,
  ];
  if (onUrlDetected) {
    extensions.push(
      URLDetectionExtension.configure({
        onUrlDetected,
      })
    );
  }

  const editor = useEditor({
    autofocus: disableAutoFocus ? false : "end",
    extensions,
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
          };

          const setLoading = (loading: boolean) => {
            if (loading) {
              editor?.view.dom.classList.add("loading-text");
            } else {
              editor?.view.dom.classList.remove("loading-text");
            }
            return editor?.setEditable(!loading);
          };

          onEnterKeyDown(
            editor.isEmpty,
            editorService.getMarkdownAndMentions(),
            clearEditor,
            setLoading
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
