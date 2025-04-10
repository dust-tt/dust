import { Button } from "@dust-tt/sparkle";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, Mark, mergeAttributes, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from "react";

import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { BlockIdExtension } from "@app/components/assistant/conversation/co_edition/extensions/BlockIdExtension";
import { getEditorContentForModel } from "@app/components/assistant/conversation/co_edition/tools/tip_tap";
import { MarkdownStyleExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/MarkdownStyleExtension";

interface CoEditionContainerProps {}

export const CoEditionContainer: React.FC<CoEditionContainerProps> = () => {
  const { serverId, isConnected, server } = useCoEditionContext();

  const editor = useEditor({
    extensions: [
      StarterKit.configure(),
      LLMContentMark,
      UserContentMark,
      MarkdownStyleExtension,
      BlockIdExtension.configure({
        types: ["heading", "paragraph", "bulletList", "orderedList"],
        attributeName: "data-id",
      }),
      Placeholder.configure({
        placeholder: "Write something amazing...",
        emptyNodeClass:
          "first:before:text-gray-400 first:before:float-left first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:h-0",
      }),
    ],
  });

  editor?.setOptions({
    editorProps: {
      attributes: {
        class: "border-0 outline-none overflow-y-auto h-full scrollbar-hide",
      },
      handleKeyDown: () => {
        // On any user input, wrap the current selection in UserContentMark
        editor.commands.unsetMark("llmContent");
        editor.commands.setMark("userContent");
      },
    },
  });

  React.useEffect(() => {
    if (editor && server) {
      server.setEditor(editor);
    }
  }, [editor, server]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2">
        <div className="text-sm text-gray-500">
          {isConnected ? (
            <span className="text-green-500">
              Connected to MCP Server: {serverId}
            </span>
          ) : (
            <span className="text-red-500">Disconnected</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <EditorContent editor={editor} />
      </div>

      <div className="h-[20%] p-4">
        <pre className="h-full overflow-auto">
          {editor && JSON.stringify(getEditorContentForModel(editor), null, 2)}
        </pre>
      </div>
    </div>
  );
};

// Mark for LLM-generated content
export const LLMContentMark = Mark.create({
  name: "llmContent",

  addAttributes() {
    return {
      class: {
        default: "text-gray-400", // Light gray color
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        getAttrs: (element) => {
          return (
            element.hasAttribute("data-author") &&
            element.getAttribute("data-author") === "llm"
          );
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-author": "llm" }),
      0,
    ];
  },
});

// Mark for user-typed content
export const UserContentMark = Mark.create({
  name: "userContent",

  addAttributes() {
    return {
      class: {
        default: "text-purple-600", // Purple color
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        getAttrs: (element) => {
          return (
            element.hasAttribute("data-author") &&
            element.getAttribute("data-author") === "user"
          );
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-author": "user" }),
      0,
    ];
  },
});
