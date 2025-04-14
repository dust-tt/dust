import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  XMarkIcon,
} from "@dust-tt/sparkle";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from "react";

import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { CoEditionCopyButton } from "@app/components/assistant/conversation/co_edition/CopyButton";
import { BlockIdExtension } from "@app/components/assistant/conversation/co_edition/extensions/BlockIdExtension";
import { CoEditionParagraphExtension } from "@app/components/assistant/conversation/co_edition/extensions/CoEditionParagraphExtension";
import { CoEditionStyleExtension } from "@app/components/assistant/conversation/co_edition/extensions/CoEditionStyleExtension";
import { UserContentMark } from "@app/components/assistant/conversation/co_edition/marks/UserContentMark";
import { insertNodes } from "@app/components/assistant/conversation/co_edition/tools/editor/utils";

interface CoEditionContainerProps {}

export const CoEditionContainer: React.FC<CoEditionContainerProps> = () => {
  const { closeCoEdition, server } = useCoEditionContext();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
      }),
      CoEditionParagraphExtension,
      UserContentMark,
      CoEditionStyleExtension,
      BlockIdExtension.configure({
        types: [
          "blockquote",
          "bulletList",
          "codeBlock",
          "heading",
          "listItem",
          "orderedList",
          "paragraph",
          "pre",
        ],
        attributeName: "data-id",
      }),
      Placeholder.configure({
        placeholder: "Write something...",
        emptyNodeClass: cn(
          "first:before:text-muted-foreground first:before:float-left",
          "first:before:content-[attr(data-placeholder)]",
          "first:before:pointer-events-none first:before:h-0"
        ),
      }),
    ],
  });

  const undo = React.useCallback(() => {
    if (editor) {
      editor.chain().focus().undo().run();
    }
  }, [editor]);

  const redo = React.useCallback(() => {
    if (editor) {
      editor.chain().focus().redo().run();
    }
  }, [editor]);

  editor?.setOptions({
    editorProps: {
      attributes: {
        class: "border-0 outline-none overflow-y-auto h-full scrollbar-hide",
      },
      handleKeyDown: () => {
        // On any user input, wrap the current selection in UserContentMark.
        // TODO(2025-04-10, flav): Narrow down to only changes.
        editor.commands.setMark("userContent");
      },
    },
  });

  // Set the editor in the server when it's ready.
  React.useEffect(() => {
    if (editor && server) {
      server.setEditor(editor);
    }
  }, [editor, server]);

  // Apply initial nodes when they're available and co-edition is enabled.
  React.useEffect(() => {
    const state = server?.getState();
    if (
      editor &&
      state &&
      state.isEnabled &&
      state.initialNodes &&
      state.initialNodes.length > 0
    ) {
      // Apply initial nodes with agent marking.
      state.initialNodes.forEach((node, idx) => {
        // Use the existing insertNodes utility.
        insertNodes(editor, {
          position: idx,
          content: node.content,
        });
      });

      // Clear the initial nodes from state.
      if (server) {
        server.clearInitialNodes();
      }
    }
  }, [editor, server]);

  return (
    <div className="flex h-full flex-col bg-muted-background dark:bg-muted-background-night">
      <div className="flex flex-row justify-between p-2">
        <div className="flex flex-row gap-2">
          <Button
            icon={ChevronLeftIcon}
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!editor?.can().undo()}
          />
          <Button
            icon={ChevronRightIcon}
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!editor?.can().redo()}
          />
          <CoEditionCopyButton editor={editor} />
        </div>
        <Button
          icon={XMarkIcon}
          variant="ghost"
          size="sm"
          onClick={closeCoEdition}
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
