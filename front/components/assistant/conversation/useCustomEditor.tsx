import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

import { makeGetAssistantSuggestions } from "./suggestion";

const useCustomEditor = (suggestions: any, onEnterKeyDown: any) => {
  const PreventEnter = Extension.create({
    addKeyboardShortcuts(this) {
      const { editor } = this;

      return {
        Enter: () => {
          // TODO: Move to a service.
          const clearEditor = () => {
            editor.commands.setContent("");
            // setIsExpanded(false);
          };

          // TODO: Parse JSON here, and pass the service.
          onEnterKeyDown(editor.getJSON(), clearEditor);

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
        StarterKit.configure({}),
        PreventEnter,
        Mention.configure({
          HTMLAttributes: {
            class:
              "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-medium",
          },
          suggestion: makeGetAssistantSuggestions(suggestions),
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
    [suggestions]
  );

  return editor;
};

export default useCustomEditor;
