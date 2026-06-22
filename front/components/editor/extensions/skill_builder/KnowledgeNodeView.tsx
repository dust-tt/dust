import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { InlineSlashSearch } from "@app/components/editor/extensions/shared/slash_suggestion/InlineSlashSearch";
import {
  InlineKnowledgeChip,
  KnowledgeErrorChip,
} from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type { KnowledgeNodeAttributes } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type {
  FullKnowledgeItem,
  KnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import {
  computeHasChildren,
  isFullKnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNodeWithSpace,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaceDataSourceView, useSpaces } from "@app/lib/swr/spaces";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  DoubleIcon,
  DropdownMenuItem,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: false,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const spaceIds = useMemo(() => spaces.map((s) => s.sId), [spaces]);

  const { knowledgeResults: searchResults, isSearchLoading } = useUnifiedSearch(
    {
      owner,
      query: searchQuery,
      pageSize: 10,
      spaceIds,
      viewType: "all",
      excludeNonRemoteDatabaseTables: true,
      includeDataSources: false,
      searchSourceUrls: true,
      includeTools: false,
      prioritizeSpaceAccess: true,
    }
  );

  const dataSourceNodes = useMemo(
    () =>
      removeNulls(
        searchResults.map((node) => {
          const { dataSourceViews, ...rest } = node;
          const dataSourceView = dataSourceViews.find(
            (view) => spacesMap[view.spaceId]
          );

          if (!dataSourceView) {
            return null;
          }

          return { ...rest, dataSourceView };
        })
      ),
    [searchResults, spacesMap]
  );

  const knowledgeItems: (FullKnowledgeItem & { description: string })[] =
    useMemo(() => {
      return dataSourceNodes.map((node) => ({
        dataSourceViewId: node.dataSourceView.sId,
        description: getLocationForDataSourceViewContentNodeWithSpace(
          node,
          spacesMap
        ),
        hasChildren: computeHasChildren(node),
        label: node.title,
        node,
        nodeId: node.internalId,
        spaceId: node.dataSourceView.spaceId,
      }));
    }, [dataSourceNodes, spacesMap]);

  useEffect(() => {
    setSelectedIndex(0);
    if (knowledgeItems.length > 0) {
      setIsOpen(true);
    }
  }, [knowledgeItems.length]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const item = knowledgeItems[index];
      if (item) {
        onSelect(item);
        setIsOpen(false);
        setSelectedIndex(0);
        setSearchQuery("");
      }
    },
    [knowledgeItems, onSelect]
  );

  const dropdownContent = isSearchLoading ? (
    <div className="flex h-14 items-center justify-center">
      <Spinner size="sm" />
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
        Searching knowledge...
      </span>
    </div>
  ) : knowledgeItems.length === 0 ? (
    <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-500-night">
      {searchQuery.length < 2
        ? "Type at least 2 characters to search"
        : "No knowledge found"}
    </div>
  ) : (
    knowledgeItems.map((item, index) => {
      if (!item.node) {
        return null;
      }
      return (
        <DropdownMenuItem
          key={item.nodeId}
          icon={
            isWebsite(item.node.dataSourceView.dataSource) ||
            isFolder(item.node.dataSourceView.dataSource) ? (
              <Icon
                visual={getVisualForDataSourceViewContentNode(item.node)}
                size="md"
              />
            ) : (
              <DoubleIcon
                size="md"
                mainIcon={getVisualForDataSourceViewContentNode(item.node)}
                secondaryIcon={getConnectorProviderLogoWithFallback({
                  provider:
                    item.node.dataSourceView.dataSource.connectorProvider,
                })}
              />
            )
          }
          label={item.label}
          description={item.description}
          truncateText
          onClick={() => handleItemSelect(index)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={
            index === selectedIndex ? "bg-gray-100 dark:bg-gray-800" : ""
          }
        />
      );
    })
  );

  return (
    <InlineSlashSearch
      dropdownContent={dropdownContent}
      isDropdownOpen={isOpen}
      itemCount={knowledgeItems.length}
      onCancel={onCancel}
      onSearchQueryChange={(text) => {
        setSearchQuery(text);
        setSelectedIndex(0);
        setIsOpen(text.trim().length > 0);
      }}
      onSelectIndex={handleItemSelect}
      onSelectedIndexChange={setSelectedIndex}
      placeholder="Search for knowledge..."
      searchQuery={searchQuery}
      selectedIndex={selectedIndex}
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
