import type { NodeCandidate, UrlCandidate } from "@app/shared/lib/connectors";
import { DataSourceLinkExtension } from "@app/ui/components/input_bar/editor/extensions/DataSourceLinkExtension";
import { MarkdownStyleExtension } from "@app/ui/components/input_bar/editor/extensions/MarkdownStyleExtension";
import { MentionStorageExtension } from "@app/ui/components/input_bar/editor/extensions/MentionStorageExtension";
import { MentionWithPasteExtension } from "@app/ui/components/input_bar/editor/extensions/MentionWithPasteExtension";
import { URLDetectionExtension } from "@app/ui/components/input_bar/editor/extensions/URLDetectionExtension";
import { URLStorageExtension } from "@app/ui/components/input_bar/editor/extensions/URLStorageExtension";
import { createMarkdownSerializer } from "@app/ui/components/input_bar/editor/markdownSerializer";
import type { EditorSuggestions } from "@app/ui/components/input_bar/editor/suggestion";
import type { SuggestionProps } from "@app/ui/components/input_bar/editor/useMentionDropdown";
import { MentionPluginKey } from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useEffect, useMemo } from "react";

const SUBMIT_MESSAGE_KEYS = ["enter", "cmd+enter"] as const;
export type SubmitMessageKey = (typeof SUBMIT_MESSAGE_KEYS)[number];

export const isSubmitMessageKey = (key: unknown): key is SubmitMessageKey => {
  if (typeof key !== "string") {
    return false;
  }
  return SUBMIT_MESSAGE_KEYS.includes(key as SubmitMessageKey);
};

export const ParagraphExtension = Paragraph.extend({
  addKeyboardShortcuts() {
    const submitMessageKey = localStorage.getItem("submitMessageKey");
    const isCmdEnter =
      isSubmitMessageKey(submitMessageKey) && submitMessageKey === "cmd+enter";

    return {
      ...this.parent?.(),

      "Shift-Enter": () => {
        if (isCmdEnter) {
          return false;
        }

        // Chain is what Tiptap does by default for Enter:
        // - newlineInCode: insert line breaks in code blocks
        // - splitListItem: if in a list item, create new list item
        // - liftEmptyBlock: if empty block (like empty quote), exit it
        // - splitBlock: fallback -> normal line break
        return this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.splitListItem("listItem"),
          () => commands.liftEmptyBlock(),
          () => commands.createParagraphNear(),
          () => commands.splitBlock(),
        ]);
      },
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
  onUrlDetected: (candidate: UrlCandidate | NodeCandidate | null) => void;
  suggestionHandler: {
    render: () => {
      onKeyDown: (props: SuggestionKeyDownProps) => boolean;
      onStart: (props: SuggestionProps) => void;
      onExit: () => void;
      onUpdate: (props: SuggestionProps) => void;
    };
  };
}

const useCustomEditor = ({
  onEnterKeyDown,
  suggestions,
  disableAutoFocus,
  onUrlDetected,
  suggestionHandler,
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
          "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-highlight-500 font-semibold",
      },
      suggestion: suggestionHandler,
    }),
    Placeholder.configure({
      placeholder: "Ask an @agent a question, or get some @help",
      emptyNodeClass:
        "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:h-0",
    }),
    MarkdownStyleExtension,
    ParagraphExtension,
    URLStorageExtension,
    URLDetectionExtension.configure({
      onUrlDetected,
    }),
  ];

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
