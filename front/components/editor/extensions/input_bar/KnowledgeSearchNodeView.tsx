import {
  KnowledgeSlashSearch,
  knowledgeNodeToItem,
} from "@app/components/editor/extensions/shared/slash_suggestion/KnowledgeSlashSearch";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { RefObject } from "react";
import { useCallback } from "react";

export interface KnowledgeSearchNodeOptions {
  attachedNodesRef?: RefObject<DataSourceViewContentNode[]>;
  onNodeSelectRef?: RefObject<
    ((node: DataSourceViewContentNode) => void) | undefined
  >;
  owner?: LightWorkspaceType;
  spaceIdRef?: RefObject<string | null | undefined>;
}

interface KnowledgeSearchNodeViewProps extends NodeViewProps {
  options: KnowledgeSearchNodeOptions;
}

export function KnowledgeSearchNodeView({
  deleteNode,
  editor,
  options,
}: KnowledgeSearchNodeViewProps) {
  const owner = options.owner;

  const handleCancel = useCallback(() => {
    deleteNode();
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
  }, [deleteNode, editor]);

  const handleSelect = useCallback(
    (node: DataSourceViewContentNode) => {
      options.onNodeSelectRef?.current?.(node);
      deleteNode();
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          editor.chain().focus().run();
        }
      });
    },
    [deleteNode, editor, options.onNodeSelectRef]
  );

  const isNodeAttached = useCallback(
    (node: DataSourceViewContentNode) => {
      const attachedNodes = options.attachedNodesRef?.current ?? [];

      return attachedNodes.some(
        (attachedNode) =>
          attachedNode.internalId === node.internalId &&
          attachedNode.dataSourceView.dataSource.sId ===
            node.dataSourceView.dataSource.sId
      );
    },
    [options.attachedNodesRef]
  );

  if (!owner) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline">
      <KnowledgeSlashSearch
        includeDataSources
        isNodeAttached={isNodeAttached}
        onCancel={handleCancel}
        onSelect={handleSelect}
        owner={owner}
        spaceId={options.spaceIdRef?.current ?? null}
      />
    </NodeViewWrapper>
  );
}

export { knowledgeNodeToItem };
