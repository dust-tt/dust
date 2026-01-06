import {
  cn,
  DoubleIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  KnowledgeChip,
  KnowledgeErrorChip,
} from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type {
  FullKnowledgeItem,
  KnowledgeItem,
  KnowledgeNodeAttributes,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import {
  computeHasChildren,
  isFullKnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNodeWithSpace,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaceDataSourceView, useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types";
import { removeNulls } from "@app/types";

interface KnowledgeDisplayProps {
  item: KnowledgeItem;
  owner: LightWorkspaceType;
  onRemove?: () => void;
  updateAttributes: (attrs: Partial<KnowledgeNodeAttributes>) => void;
}

export function KnowledgeDisplayComponent({
  item,
  owner,
  onRemove,
  updateAttributes,
}: KnowledgeDisplayProps) {
  // Check if we need to fetch full node data.
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

  // Update the item with fetched node data.
  useEffect(() => {
    if (
      updateAttributes &&
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
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1",
          "text-sm text-gray-600"
        )}
      >
        <Spinner size="xs" />
        <span>{item.label}</span>
      </span>
    );
  }

  // At this point we must have a full item with node data.
  return (
    <KnowledgeChip
      node={{
        ...item.node,
        dataSource: item.node.dataSourceView.dataSource,
      }}
      onRemove={onRemove}
      title={item.label}
    />
  );
}

interface KnowledgeSearchProps {
  onSelect: (item: KnowledgeItem) => void;
  onCancel: () => void;
  clientRect?: () => DOMRect | null;
}

function KnowledgeSearchComponent({
  onSelect,
  onCancel,
  clientRect,
}: KnowledgeSearchProps) {
  const { owner } = useSkillBuilderContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  // Get spaces for location display.
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: false,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const spaceIds = useMemo(() => spaces.map((s) => s.sId), [spaces]);

  const isDisabled = !searchQuery || searchQuery.length < 2;

  const { knowledgeResults: searchResults, isSearchLoading } = useUnifiedSearch(
    {
      owner,
      query: searchQuery,
      pageSize: 10,
      disabled: isDisabled,
      spaceIds,
      // Tables can't be attached to a skill.
      viewType: "document",
      includeDataSources: false,
      searchSourceUrls: false,
      includeTools: false,
    }
  );

  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  // Update virtual trigger position.
  const updateTriggerPosition = useCallback(() => {
    const triggerRect = clientRect?.();
    if (triggerRect && triggerRef.current) {
      setVirtualTriggerStyle({
        position: "fixed",
        left: triggerRect.left,
        top: triggerRect.top + (window.visualViewport?.offsetTop ?? 0),
        width: 1,
        height: triggerRect.height || 1,
        pointerEvents: "none",
        zIndex: -1,
      });
    }
  }, [clientRect]);

  useEffect(() => {
    updateTriggerPosition();
  }, [updateTriggerPosition]);

  // Convert API results to properly formatted nodes.
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
      return dataSourceNodes.map((node) => {
        return {
          dataSourceViewId: node.dataSourceView.sId,
          description: getLocationForDataSourceViewContentNodeWithSpace(
            node,
            spacesMap
          ),
          hasChildren: computeHasChildren(node),
          label: node.title,
          node, // Store the original node for chip display.
          nodeId: node.internalId,
          spaceId: node.dataSourceView.spaceId,
        };
      });
    }, [dataSourceNodes, spacesMap]);

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

  const handleItemClick = useCallback(
    (item: KnowledgeItem) => {
      const index = knowledgeItems.findIndex((i) => i.nodeId === item.nodeId);
      if (index !== -1) {
        handleItemSelect(index);
      }
    },
    [knowledgeItems, handleItemSelect]
  );

  // Handle input events.
  const handleInput = useCallback((e: React.FormEvent<HTMLSpanElement>) => {
    const text = e.currentTarget.textContent ?? "";
    setSearchQuery(text);
    setIsOpen(text.trim().length > 0);
  }, []);

  // Auto-focus when component mounts.
  useEffect(() => {
    if (contentRef.current) {
      // Add a timeout to ensure focus after render.
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
          const range = document.createRange();
          const sel = window.getSelection();

          if (sel) {
            range.selectNodeContents(contentRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 10);
    }
  }, []);

  // Reset selected index when items change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [knowledgeItems.length]);

  // Delete empty node helper.
  const deleteIfEmpty = useCallback(
    (delay: number = 50) => {
      setTimeout(() => {
        if (!searchQuery.trim()) {
          onCancel();
        }
      }, delay);
    },
    [searchQuery, onCancel]
  );

  // Handle keyboard navigation.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((selectedIndex + 1) % knowledgeItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (selectedIndex + knowledgeItems.length - 1) % knowledgeItems.length
        );
      } else if (
        (e.key === "Enter" || e.key === "Tab") &&
        knowledgeItems.length > 0
      ) {
        e.preventDefault();
        handleItemSelect(selectedIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [isOpen, selectedIndex, knowledgeItems.length, handleItemSelect, onCancel]
  );

  const handleBlur = useCallback(() => {
    deleteIfEmpty(50);
  }, [deleteIfEmpty]);

  const handleInteractOutside = useCallback(() => {
    setIsOpen(false);
    deleteIfEmpty(50);
  }, [deleteIfEmpty]);

  return (
    <div className="relative inline-block">
      <span
        className={cn(
          "inline-block h-7 cursor-text rounded-md bg-gray-100 px-3 py-1 text-sm italic",
          "text-gray-600 empty:before:text-gray-400",
          "empty:before:content-[attr(data-placeholder)] focus:outline-none",
          "min-w-36 text-left"
        )}
        contentEditable
        suppressContentEditableWarning
        ref={contentRef}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onBlur={handleBlur}
        data-placeholder="Search for knowledge..."
      />

      {isOpen && (
        <DropdownMenu open={true}>
          <DropdownMenuTrigger asChild>
            <div ref={triggerRef} style={virtualTriggerStyle} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-96"
            align="start"
            avoidCollisions
            onInteractOutside={handleInteractOutside}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {isSearchLoading ? (
              <div className="flex h-14 items-center justify-center">
                <Spinner size="sm" />
                <span className="ml-2 text-sm text-gray-500">
                  Searching knowledge...
                </span>
              </div>
            ) : knowledgeItems.length === 0 ? (
              <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500">
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
                          visual={getVisualForDataSourceViewContentNode(
                            item.node
                          )}
                          size="md"
                        />
                      ) : (
                        <DoubleIcon
                          size="md"
                          mainIcon={getVisualForDataSourceViewContentNode(
                            item.node
                          )}
                          secondaryIcon={getConnectorProviderLogoWithFallback({
                            provider:
                              item.node.dataSourceView.dataSource
                                .connectorProvider,
                          })}
                        />
                      )
                    }
                    label={item.label}
                    description={item.description}
                    truncateText
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={
                      index === selectedIndex
                        ? "bg-gray-100 dark:bg-gray-800"
                        : ""
                    }
                  />
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface ExtendedNodeViewProps extends NodeViewProps {
  clientRect?: () => DOMRect | null;
}

export const KnowledgeNodeView: React.FC<ExtendedNodeViewProps> = ({
  clientRect,
  deleteNode,
  editor,
  node,
  updateAttributes,
}) => {
  const { owner } = useSkillBuilderContext();
  const { selectedItems } = node.attrs as KnowledgeNodeAttributes;

  const handleRemove = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  const handleSelect = useCallback(
    (item: KnowledgeItem) => {
      updateAttributes({
        selectedItems: [item],
      });

      // Return focus to the editor after selection and add a space.
      setTimeout(() => {
        if (editor) {
          editor.chain().focus().insertContent(" ").run();
        }
      }, 10);
    },
    [updateAttributes, editor]
  );

  // Show selected knowledge.
  if (selectedItems.length > 0) {
    return (
      <NodeViewWrapper className="inline">
        <KnowledgeDisplayComponent
          item={selectedItems[0]}
          owner={owner}
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
        onCancel={deleteNode}
        clientRect={clientRect}
      />
    </NodeViewWrapper>
  );
};
