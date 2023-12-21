import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Editor, Extension, JSONContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useMemo } from "react";

import { makeGetAssistantSuggestions } from "./suggestion";

export interface EditorMention {
  id: string;
  label: string;
}

const useEditorService = (editor: Editor | null) => {
  const editorService = useMemo(() => {
    // Return the service object with utility functions
    return {
      getMentions: () => {
        // Implement parsing logic here
        // TODO:
        return editor?.getJSON();
      },

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

      resetWithMentions: (mentions: any[]) => {
        editor?.commands.clearContent();
        const chainCommands = editor?.chain().focus();

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

      getTrimmedText() {
        return editor?.getText().trim();
      },

      clearEditor() {
        return editor?.commands.clearContent();
      },

      // Additional helper functions can be added here.
    };
  }, [editor]);

  return editorService;
};

export type EditorService = ReturnType<typeof useEditorService>;

export interface CustomEditorProps {
  onEnterKeyDown: (
    isEmpty: boolean,
    jsonPayload: JSONContent | undefined,
    clearEditor: () => void
  ) => void;
  suggestions: any[];
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

  const PreventEnter = Extension.create({
    addKeyboardShortcuts(this) {
      const { editor } = this;

      return {
        Enter: () => {
          // TODO: Move to a service.
          const clearEditor = () => {
            editor.commands.clearContent();
            resetEditorContainerSize();
          };

          // TODO: Parse JSON here, and pass the service.
          onEnterKeyDown(editor.isEmpty, editor.getJSON(), clearEditor);

          return true;
        },
      };
    },
  });

  const editor = useEditor(
    {
      enableInputRules: false, // Disable Markdown when typing.
      enablePasteRules: false, // Disable Markdown when pasting.
      extensions: [
        // TODO: Consider,
        // StarterKit.configure({
        //   history: false,
        // }),
        StarterKit.configure({}),
        PreventEnter,
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
            "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none",
        }),
      ],
      editorProps: {
        attributes: {
          class: "border-0 outline-none overflow-y-auto h-full",
        },
      },
    },
    [getSuggestions]
  );

  // Use the custom hook to get the editor service
  const editorService = useEditorService(editor);

  // Expose the editor instance and the editor service
  return {
    editor,
    editorService,
  };
};

export default useCustomEditor;
