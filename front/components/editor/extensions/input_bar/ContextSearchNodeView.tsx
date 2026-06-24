import { FILE_PREVIEW_NODE_TYPE } from "@app/components/editor/extensions/input_bar/FilePreviewExtension";
import {
  ContextSlashSearch,
  type ContextSlashSearchSelection,
} from "@app/components/editor/extensions/shared/slash_suggestion/ContextSlashSearch";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { RefObject } from "react";
import { useCallback } from "react";

export interface ContextSearchNodeOptions {
  attachedNodesRef?: RefObject<DataSourceViewContentNode[]>;
  conversationIdRef?: RefObject<string | null>;
  onNodeSelectRef?: RefObject<
    ((node: DataSourceViewContentNode) => void) | undefined
  >;
  owner?: LightWorkspaceType;
  spaceIdRef?: RefObject<string | null | undefined>;
}

interface ContextSearchNodeViewProps extends NodeViewProps {
  options: ContextSearchNodeOptions;
}

function getContextFileReferenceContent(
  selection: Extract<ContextSlashSearchSelection, { kind: "file" }>["selection"]
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

export function ContextSearchNodeView({
  deleteNode,
  editor,
  getPos,
  node,
  options,
}: ContextSearchNodeViewProps) {
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

  const handleSelect = useCallback(
    (selection: ContextSlashSearchSelection) => {
      if (selection.kind === "knowledge") {
        options.onNodeSelectRef?.current?.(selection.node);
        deleteNode();
        queueMicrotask(() => {
          if (!editor.isDestroyed) {
            editor.chain().focus().run();
          }
        });
        return;
      }

      const pos = getPos();
      if (typeof pos !== "number") {
        return;
      }

      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent(getContextFileReferenceContent(selection.selection))
        .run();
    },
    [deleteNode, editor, getPos, node.nodeSize, options.onNodeSelectRef]
  );

  const isNodeAttached = useCallback(
    (attachedNode: DataSourceViewContentNode) => {
      const attachedNodes = options.attachedNodesRef?.current ?? [];

      return attachedNodes.some(
        (node) =>
          node.internalId === attachedNode.internalId &&
          node.dataSourceView.dataSource.sId ===
            attachedNode.dataSourceView.dataSource.sId
      );
    },
    [options.attachedNodesRef]
  );

  if (!owner) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline">
      <ContextSlashSearch
        conversationId={conversationId}
        isNodeAttached={isNodeAttached}
        onCancel={handleCancel}
        onSelect={handleSelect}
        owner={owner}
        useCase="conversation-input"
        spaceId={options.spaceIdRef?.current ?? null}
      />
    </NodeViewWrapper>
  );
}
