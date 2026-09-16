import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import {
  InlineKnowledgeChip,
  KnowledgeErrorChip,
} from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type { KnowledgeNodeAttributes } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { isHydratedKnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceView } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, Spinner } from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect } from "react";

// Re-exports for existing consumers that import these from KnowledgeNodeView.
// The canonical home is now KnowledgeNodeTypes.ts (React-free).
export type {
  HydratedKnowledgeItem,
  KnowledgeItem,
  SerializedKnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
export {
  computeHasChildren,
  isHydratedKnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";

interface KnowledgeDisplayProps {
  item: KnowledgeItem;
  owner: LightWorkspaceType;
  isSpacesLoading?: boolean;
  onRemove?: () => void;
  updateAttributes: (attrs: Partial<KnowledgeNodeAttributes>) => void;
}

function KnowledgeDisplayComponent({
  item,
  owner,
  isSpacesLoading = false,
  onRemove,
  updateAttributes,
}: KnowledgeDisplayProps) {
  const needsFetch = !isHydratedKnowledgeItem(item);

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

  if (isFetchingNode || (needsFetch && !isHydratedKnowledgeItem(item))) {
    return (
      <Chip label={item.label} color="primary" size="xs">
        <Spinner size="xs" />
      </Chip>
    );
  }

  return (
    <InlineKnowledgeChip
      node={item.node}
      onRemove={onRemove}
      title={item.label}
    />
  );
}

// Rendered in the conversation composer, which has no SpacesProvider
function StaticKnowledgeChip({
  item,
  onRemove,
}: {
  item: KnowledgeItem;
  onRemove?: () => void;
}) {
  if (isHydratedKnowledgeItem(item)) {
    return (
      <InlineKnowledgeChip
        node={item.node}
        onRemove={onRemove}
        title={item.label}
      />
    );
  }

  return (
    <Chip label={item.label} color="primary" size="xs" onRemove={onRemove} />
  );
}

function KnowledgeNodeViewShell({
  deleteNode,
  editor,
  node,
  children,
}: Pick<NodeViewProps, "deleteNode" | "editor" | "node"> & {
  children: (item: KnowledgeItem, onRemove?: () => void) => React.ReactNode;
}) {
  const { selectedItems } = node.attrs as KnowledgeNodeAttributes;

  const handleRemove = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  useLayoutEffect(() => {
    if (selectedItems.length === 0 && editor.isEditable) {
      deleteNode();
    }
  }, [deleteNode, editor.isEditable, selectedItems.length]);

  if (selectedItems.length === 0) {
    return null;
  }

  const item = selectedItems[0];
  const onRemove = editor.isEditable ? handleRemove : undefined;

  return (
    <NodeViewWrapper className="inline-flex align-middle" data-drag-handle="">
      {children(item, onRemove)}
    </NodeViewWrapper>
  );
}

export const InteractiveKnowledgeNodeView: React.FC<NodeViewProps> = (
  props
) => {
  const { owner, isSpacesLoading } = useSpacesContext();

  return (
    <KnowledgeNodeViewShell {...props}>
      {(item, onRemove) => (
        <KnowledgeDisplayComponent
          item={item}
          owner={owner}
          isSpacesLoading={isSpacesLoading}
          onRemove={onRemove}
          updateAttributes={props.updateAttributes}
        />
      )}
    </KnowledgeNodeViewShell>
  );
};

// Composer view: no SpacesProvider, renders whatever the item already carries.
export const StaticKnowledgeNodeView: React.FC<NodeViewProps> = (props) => (
  <KnowledgeNodeViewShell {...props}>
    {(item, onRemove) => (
      <StaticKnowledgeChip item={item} onRemove={onRemove} />
    )}
  </KnowledgeNodeViewShell>
);
