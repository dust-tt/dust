import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import {
  KnowledgeSlashSearch,
  knowledgeNodeToItem,
} from "@app/components/editor/extensions/shared/slash_suggestion/KnowledgeSlashSearch";
import {
  InlineKnowledgeChip,
  KnowledgeErrorChip,
} from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type { KnowledgeNodeAttributes } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { isFullKnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceView } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, Spinner } from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect } from "react";

// Re-exports for existing consumers that import these from KnowledgeNodeView.
// The canonical home is now KnowledgeNodeTypes.ts (React-free).
export type {
  BaseKnowledgeItem,
  FullKnowledgeItem,
  KnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
export {
  computeHasChildren,
  isFullKnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";

interface KnowledgeDisplayProps {
  item: KnowledgeItem;
  owner: LightWorkspaceType;
  isSpacesLoading?: boolean;
  onRemove?: () => void;
  updateAttributes: (attrs: Partial<KnowledgeNodeAttributes>) => void;
}

export function KnowledgeDisplayComponent({
  item,
  owner,
  isSpacesLoading = false,
  onRemove,
  updateAttributes,
}: KnowledgeDisplayProps) {
  // Check if we need to fetch full node data.
  const needsFetch = !isFullKnowledgeItem(item);

  const { dataSourceView, isDataSourceViewError } = useSpaceDataSourceView({
    dataSourceViewId: item.dataSourceViewId,
    disabled: !needsFetch || isSpacesLoading,
    owner,
    spaceId: item.spaceId,
  });

  const { nodes: fetchedNodes, isNodesLoading: isFetchingNode } =
    useDataSourceViewContentNodes({
      owner,
      dataSourceView: needsFetch && dataSourceView ? dataSourceView : undefined,
      internalIds: needsFetch ? [item.nodeId] : undefined,
      viewType: "all",
      disabled: !needsFetch || !dataSourceView,
    });

  // Update the item with fetched node data.
  useEffect(() => {
    if (
      needsFetch &&
      fetchedNodes &&
      fetchedNodes.length > 0 &&
      !isFetchingNode
    ) {
      const fullNode = fetchedNodes[0];

      updateAttributes({
        selectedItems: [
          {
            ...item,
            node: fullNode,
          },
        ],
      });
    }
  }, [fetchedNodes, needsFetch, isFetchingNode, item, updateAttributes]);

  // Show error state if data source view or content node can't be found.
  if (
    isDataSourceViewError ||
    (needsFetch &&
      dataSourceView &&
      fetchedNodes &&
      fetchedNodes.length === 0 &&
      !isFetchingNode)
  ) {
    return (
      <KnowledgeErrorChip
        title={item.label}
        onRemove={onRemove}
        errorMessage={
          isDataSourceViewError ? "Data source not found" : "Content not found"
        }
      />
    );
  }

  // Show loading state while fetching node data or waiting for upgrade to full item.
  if (isFetchingNode || (needsFetch && !isFullKnowledgeItem(item))) {
    return (
      <Chip label={item.label} color="white" size="xs">
        <Spinner size="xs" />
      </Chip>
    );
  }

  // At this point we must have a full item with node data.
  return (
    <InlineKnowledgeChip
      node={item.node}
      onRemove={onRemove}
      title={item.label}
    />
  );
}

interface KnowledgeSearchProps {
  onSelect: (item: KnowledgeItem) => void;
  onCancel: () => void;
}

function KnowledgeSearchComponent({
  onSelect,
  onCancel,
}: KnowledgeSearchProps) {
  const { owner } = useSpacesContext();

  return (
    <KnowledgeSlashSearch
      excludeNonRemoteDatabaseTables
      onCancel={onCancel}
      onSelect={(node) => onSelect(knowledgeNodeToItem(node))}
      owner={owner}
    />
  );
}

interface ExtendedNodeViewProps extends NodeViewProps {
  clientRect?: () => DOMRect | null;
}

export const KnowledgeNodeView: React.FC<ExtendedNodeViewProps> = ({
  deleteNode,
  editor,
  node,
  updateAttributes,
}) => {
  const { owner, isSpacesLoading } = useSpacesContext();
  const { selectedItems } = node.attrs as KnowledgeNodeAttributes;

  const handleRemove = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  const handleCancel = useCallback(() => {
    deleteNode();
    // Return focus to the editor after the node is removed from the DOM.
    // We need to wait for the next event loop tick for TipTap to process the deletion.
    queueMicrotask(() => {
      if (editor && !editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
  }, [deleteNode, editor]);

  const handleSelect = useCallback(
    (item: KnowledgeItem) => {
      updateAttributes({
        selectedItems: [item],
      });

      // Return focus to the editor after selection and add a space.
      // Wait for the next event loop tick for TipTap to process the attribute update.
      queueMicrotask(() => {
        if (editor && !editor.isDestroyed) {
          editor.chain().focus().insertContent(" ").run();
        }
      });
    },
    [updateAttributes, editor]
  );

  // Show selected knowledge.
  if (selectedItems.length > 0) {
    return (
      <NodeViewWrapper className="inline-flex align-middle" data-drag-handle="">
        <KnowledgeDisplayComponent
          item={selectedItems[0]}
          owner={owner}
          isSpacesLoading={isSpacesLoading}
          onRemove={editor.isEditable ? handleRemove : undefined}
          updateAttributes={updateAttributes}
        />
      </NodeViewWrapper>
    );
  }

  // Show search interface.
  return (
    <NodeViewWrapper className="inline">
      <KnowledgeSearchComponent
        onSelect={handleSelect}
        onCancel={handleCancel}
      />
    </NodeViewWrapper>
  );
};
