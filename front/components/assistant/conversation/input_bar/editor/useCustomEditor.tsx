import { MentionPluginKey } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useEffect, useMemo } from "react";

import { DataSourceLinkExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/DataSourceLinkExtension";
import { MarkdownStyleExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MarkdownStyleExtension";
import { MentionExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MentionExtension";
import { MentionStorageExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MentionStorageExtension";
import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import { URLDetectionExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/URLDetectionExtension";
import { createMarkdownSerializer } from "@app/components/assistant/conversation/input_bar/editor/markdownSerializer";
import type { EditorSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import type { SuggestionProps } from "@app/components/assistant/conversation/input_bar/editor/useMentionDropdown";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { isMobile } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";

import { URLStorageExtension } from "./extensions/URLStorageExtension";

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
      // Insert text helper function.
      insertText: (text: string) => {
        editor?.chain().focus().insertContent(text).run();
      },
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
  onUrlDetected?: (candidate: UrlCandidate | NodeCandidate | null) => void;
  suggestionHandler: {
    render: () => {
      onKeyDown: (props: SuggestionKeyDownProps) => boolean;
      onStart: (props: SuggestionProps) => void;
      onExit: () => void;
      onUpdate: (props: SuggestionProps) => void;
    };
  };
  owner: WorkspaceType;
}

const useCustomEditor = ({
  onEnterKeyDown,
  suggestions,
  disableAutoFocus,
  onUrlDetected,
  suggestionHandler,
  owner,
}: CustomEditorProps) => {
  const extensions = [
    StarterKit.configure({
      hardBreak: false, // Disable the built-in Shift+Enter.
      paragraph: false,
      strike: false,
    }),
    MentionStorageExtension,
    DataSourceLinkExtension,
    MentionExtension.configure({
      owner,
      HTMLAttributes: {
        class:
          "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-highlight-500 font-semibold",
      },
      // Ensure queries can contain spaces (e.g., @Sales Team → decomposes to
      // text and keeps the dropdown active over the full label).
      suggestion: { ...suggestionHandler, allowSpaces: true },
    }),
    Placeholder.configure({
      placeholder: "Ask an @agent a question, or get some @help",
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
        const submitMessageKey = localStorage.getItem("submitMessageKey");
        const isCmdEnterForSubmission =
          isSubmitMessageKey(submitMessageKey) &&
          submitMessageKey === "cmd+enter";
        const isEnterForSubmission = !isCmdEnterForSubmission;

        // Check if this is a submission key combination based on user preferences
        const isSubmissionKey =
          (isEnterForSubmission &&
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey) ||
          (isCmdEnterForSubmission && event.key === "Enter" && event.metaKey);

        if (isSubmissionKey) {
          const mentionPluginState = MentionPluginKey.getState(view.state);
          // Let the mention extension handle the event if its dropdown is currently opened.
          if (mentionPluginState?.active) {
            return false;
          }

          // On mobile, we want to let the user go to the next line and not immediately send
          if (isMobile(navigator)) {
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
