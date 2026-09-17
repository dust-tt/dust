import {
  InlineKnowledgeChip,
  KnowledgeErrorChip,
} from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type { KnowledgeNodeAttributes } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { isFullKnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { useAuth } from "@app/lib/auth/AuthContext";
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
  BaseKnowledgeItem,
  FullKnowledgeItem,
  KnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
export {
  computeHasChildren,
  isFullKnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";

interface HydratingKnowledgeChipProps {
  item: KnowledgeItem;
  owner: LightWorkspaceType;
  onRemove?: () => void;
  updateAttributes: (attrs: Partial<KnowledgeNodeAttributes>) => void;
}

// Fetches the content node for base items (e.g. restored from a draft's
// serialized <knowledge> tag) and hydrates the node attrs so the chip gets its
// icon back; full items render directly.
function HydratingKnowledgeChip({
  item,
  owner,
  onRemove,
  updateAttributes,
}: HydratingKnowledgeChipProps) {
  const needsFetch = !isFullKnowledgeItem(item);

  const { dataSourceView, isDataSourceViewError } = useSpaceDataSourceView({
    dataSourceViewId: item.dataSourceViewId,
    disabled: !needsFetch,
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

  if (isFetchingNode || (needsFetch && !isFullKnowledgeItem(item))) {
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

interface KnowledgeNodeViewShellProps
  extends Pick<NodeViewProps, "deleteNode" | "editor" | "node"> {
  children: (item: KnowledgeItem, onRemove?: () => void) => React.ReactNode;
}

function KnowledgeNodeViewShell({
  deleteNode,
  editor,
  node,
  children,
}: KnowledgeNodeViewShellProps) {
  const { selectedItems } = node.attrs as KnowledgeNodeAttributes;

  const handleRemove = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  // Clean up empty knowledge nodes (e.g. a dismissed search state or malformed
  // paste): an empty node renders as null and isn't serialized, so drop it from
  // the editable doc rather than leaving an invisible orphan.
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

export const KnowledgeNodeView: React.FC<NodeViewProps> = (props) => {
  const { workspace } = useAuth();

  return (
    <KnowledgeNodeViewShell {...props}>
      {(item, onRemove) => (
        <HydratingKnowledgeChip
          item={item}
          owner={workspace}
          onRemove={onRemove}
          updateAttributes={props.updateAttributes}
        />
      )}
    </KnowledgeNodeViewShell>
  );
};
