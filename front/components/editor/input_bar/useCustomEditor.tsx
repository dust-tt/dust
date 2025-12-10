import { markdownStyles } from "@dust-tt/sparkle";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Editor } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useMemo } from "react";

import { DataSourceLinkExtension } from "@app/components/editor/extensions/input_bar/DataSourceLinkExtension";
import { KeyboardShortcutsExtension } from "@app/components/editor/extensions/input_bar/KeyboardShortcutsExtension";
import { PastedAttachmentExtension } from "@app/components/editor/extensions/input_bar/PastedAttachmentExtension";
import { URLDetectionExtension } from "@app/components/editor/extensions/input_bar/URLDetectionExtension";
import { URLStorageExtension } from "@app/components/editor/extensions/input_bar/URLStorageExtension";
import { MentionExtension } from "@app/components/editor/extensions/MentionExtension";
import { BlockquoteExtension } from "@app/components/editor/input_bar/BlockquoteExtension";
import { cleanupPastedHTML } from "@app/components/editor/input_bar/cleanupPastedHTML";
import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import {
  createMentionSuggestion,
  mentionPluginKey,
} from "@app/components/editor/input_bar/mentionSuggestion";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { extractFromEditorJSON } from "@app/lib/mentions/format";
import { isMobile } from "@app/lib/utils";
import type { RichMention, WorkspaceType } from "@app/types";

const DEFAULT_LONG_TEXT_PASTE_CHARS_THRESHOLD = 16000;

function isLongTextPaste(text: string, maxCharThreshold?: number) {
  const maxChars = maxCharThreshold ?? DEFAULT_LONG_TEXT_PASTE_CHARS_THRESHOLD;
  return text.length > maxChars;
}

const useEditorService = (editor: Editor | null) => {
  return useMemo(() => {
    // Return the service object with utility functions.
    return {
      // Insert text helper function.
      insertText: (text: string) => {
        editor?.chain().focus().insertContent(text).run();
      },
      // Insert mention helper function.
      insertMention: ({
        type,
        id,
        label,
        description,
        pictureUrl,
      }: {
        type: "agent" | "user";
        id: string;
        label: string;
        description?: string;
        pictureUrl?: string;
      }) => {
        const shouldAddSpaceBeforeMention =
          !editor?.isEmpty &&
          editor?.getText()[editor?.getText().length - 1] !== " ";
        editor
          ?.chain()
          .focus()
          .insertContent(shouldAddSpaceBeforeMention ? " " : "") // Add an extra space before the mention.
          .insertContent({
            type: "mention",
            attrs: { type, id, label, description, pictureUrl },
          })
          .insertContent(" ") // Add an extra space after the mention.
          .run();
      },
      setContent: (content: string) => {
        editor
          ?.chain()
          .setContent(content, {
            contentType: "markdown",
          })
          .focus()
          .run();
      },
      resetWithMentions: (
        mentions: RichMention[],
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

      getMarkdownAndMentions() {
        if (!editor?.state.doc) {
          return {
            markdown: "",
            mentions: [],
          };
        }

        return {
          markdown: editor.getMarkdown(),
          mentions: extractFromEditorJSON(editor?.getJSON()).mentions,
        };
      },

      hasMention(mention: RichMention) {
        const { mentions } = extractFromEditorJSON(editor?.getJSON());
        return mentions.some(
          (m) => m.id === mention.id && m.type === mention.type
        );
      },

      getTrimmedText() {
        return editor?.getText().trim();
      },

      blur() {
        return editor?.commands.blur();
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
  }, [editor]);
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
  disableAutoFocus: boolean;
  onUrlDetected?: (candidate: UrlCandidate | NodeCandidate | null) => void;
  owner: WorkspaceType;
  conversationId: string | null;
  preferredAgentId?: string | null;
  // If provided, large pasted text will be routed to this callback along with selection bounds
  onLongTextPaste?: (payload: {
    text: string;
    from: number;
    to: number;
  }) => void;
  longTextPasteCharsThreshold?: number;
  onInlineText?: (fileId: string, textContent: string) => void;
}

export const buildEditorExtensions = ({
  owner,
  conversationId,
  preferredAgentId,
  onInlineText,
  onUrlDetected,
}: {
  owner: WorkspaceType;
  conversationId: string | null;
  preferredAgentId?: string | null;
  onInlineText?: (fileId: string, textContent: string) => void;
  onUrlDetected?: (candidate: UrlCandidate | NodeCandidate | null) => void;
}) => {
  const extensions = [
    KeyboardShortcutsExtension,
    StarterKit.configure({
      hardBreak: false, // Disable the built-in Shift+Enter. We handle it ourselves in the keymap extension
      strike: false,
      link: false, // Disable built-in Link extension, using custom LinkExtension instead
      heading: {
        levels: [1],
      },
      blockquote: false, // Disable default blockquote, we use a custom one
      // Markdown styles configuration.
      code: {
        HTMLAttributes: {
          class: markdownStyles.code(),
        },
      },
      codeBlock: {
        HTMLAttributes: {
          class: markdownStyles.code(),
        },
      },
      bulletList: {
        HTMLAttributes: {
          class: markdownStyles.unorderedList(),
        },
      },
      listItem: {
        HTMLAttributes: {
          class: markdownStyles.list(),
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: markdownStyles.orderedList(),
        },
      },
      paragraph: {
        HTMLAttributes: {
          class: markdownStyles.paragraph(),
        },
      },
    }),
    BlockquoteExtension.configure({
      HTMLAttributes: {
        class: markdownStyles.blockquote(),
      },
    }),
    Markdown,
    DataSourceLinkExtension,
    LinkExtension.configure({
      HTMLAttributes: {
        class: "text-blue-600 hover:underline hover:text-blue-800",
      },
      autolink: false,
    }),
    MentionExtension.configure({
      owner,
      HTMLAttributes: {
        class:
          "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-highlight-500 font-semibold",
      },
      suggestion: createMentionSuggestion({
        owner,
        conversationId,
        preferredAgentId,
      }),
    }),
    Placeholder.configure({
      placeholder: "Ask an @agent a question, or get some @help",
      emptyNodeClass:
        "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:h-0",
    }),
    PastedAttachmentExtension.configure({
      onInlineText,
    }),
    URLStorageExtension,
  ];
  if (onUrlDetected) {
    extensions.push(
      URLDetectionExtension.configure({
        onUrlDetected,
      })
    );
  }

  return extensions;
};

const useCustomEditor = ({
  onEnterKeyDown,
  disableAutoFocus,
  onUrlDetected,
  owner,
  conversationId,
  preferredAgentId,
  onLongTextPaste,
  longTextPasteCharsThreshold,
  onInlineText,
}: CustomEditorProps) => {
  const editor = useEditor({
    autofocus: disableAutoFocus ? false : "end",
    extensions: buildEditorExtensions({
      owner,
      conversationId,
      preferredAgentId,
      onInlineText,
      onUrlDetected,
    }),
    shouldRerenderOnTransaction: true, // necessary to update the editor state (and so the toolbar icons "activation") in real time
    editorProps: {
      attributes: {
        class:
          "border-0 outline-none overflow-y-auto h-full scrollbar-hide [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:my-2 [&_a]:cursor-text",
      },
      // cleans up incoming HTML to remove all style that could mess up with our theme
      transformPastedHTML(html: string) {
        return cleanupPastedHTML(html);
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text || !onLongTextPaste) {
          return false;
        }
        if (isLongTextPaste(text, longTextPasteCharsThreshold)) {
          const { from, to } = view.state.selection;
          onLongTextPaste({ text, from, to });
          return true;
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  const editorService = useEditorService(editor);

  // Set keydown handler after editor is initialized to avoid synchronous updates during render.
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setOptions({
      editorProps: {
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
            const mentionPluginState = mentionPluginKey.getState(view.state);
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
  }, [editor, editorService, onEnterKeyDown]);

  // Expose the editor instance and the editor service.
  return {
    editor,
    editorService,
  };
};

export default useCustomEditor;
