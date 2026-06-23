import { FILE_PREVIEW_NODE_TYPE } from "@app/components/editor/extensions/input_bar/FilePreviewExtension";
import {
  ContextFileSlashSearch,
  type ContextFileSlashSearchSelection,
} from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import type { LightWorkspaceType } from "@app/types/user";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { RefObject } from "react";
import { useCallback } from "react";

export interface FileSearchNodeOptions {
  conversationIdRef?: RefObject<string | null>;
  owner?: LightWorkspaceType;
  spaceIdRef?: RefObject<string | null | undefined>;
}

interface FileSearchNodeViewProps extends NodeViewProps {
  options: FileSearchNodeOptions;
}

function getContextFileReferenceContent(
  selection: ContextFileSlashSearchSelection
) {
  return [
    {
      type: FILE_PREVIEW_NODE_TYPE,
      attrs: {
        contentType: selection.contentType,
        path: selection.path,
        title: selection.label,
      },
    },
    { type: "text" as const, text: " " },
  ];
}

export function FileSearchNodeView({
  deleteNode,
  editor,
  getPos,
  node,
  options,
}: FileSearchNodeViewProps) {
  const owner = options.owner;
  const conversationId = options.conversationIdRef?.current ?? null;

  const handleCancel = useCallback(() => {
    deleteNode();
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
  }, [deleteNode, editor]);

  const handleFileSelect = useCallback(
    (selection: ContextFileSlashSearchSelection) => {
      const pos = getPos();
      if (typeof pos !== "number") {
        return;
      }

      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent(getContextFileReferenceContent(selection))
        .run();
    },
    [editor, getPos, node.nodeSize]
  );

  if (!owner) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline">
      <ContextFileSlashSearch
        conversationId={conversationId}
        onCancel={handleCancel}
        onFileSelect={handleFileSelect}
        owner={owner}
        spaceId={options.spaceIdRef?.current ?? null}
      />
    </NodeViewWrapper>
  );
}
