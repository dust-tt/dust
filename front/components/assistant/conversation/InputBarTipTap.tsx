// import "./styles.scss";

import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from "react";

import { classNames } from "@app/lib/utils";

import { makeGetAssistantSuggestions } from "./suggestion.js";

// const PreventEnter = Extension.create({
//   addKeyboardShortcuts(this) {
//     return {
//       'Enter': () => true
//     }
//   },
// })

const Tiptap = (props: any) => {
  // Consider:
  // StarterKit.configure({
  //   history: false,
  // }),
  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class:
            "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-medium",
        },
        suggestion: makeGetAssistantSuggestions(props.assistants),
      }),
      Placeholder.configure({
        placeholder: "Ask a question or get some @help",
        emptyNodeClass:
          "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none",
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "w-full border-0 pr-1 py-3.5 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 whitespace-pre-wrap font-normal scrollbar-hide overflow-y-auto max-h-64 h-24",
      },
    },
  });

  return (
    <EditorContent
      editor={editor}
      className={classNames(
        "dust-input-bar min-height:200px relative flex flex-1 flex-col border-0"
      )}
    />
  );
};

export default Tiptap;
