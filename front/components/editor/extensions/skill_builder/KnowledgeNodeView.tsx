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

import type {
  KnowledgeItem,
  KnowledgeNodeAttributes,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNode";

interface ExtendedNodeViewProps extends NodeViewProps {
  clientRect?: () => DOMRect | null;
}
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNodeWithSpace,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import { removeNulls } from "@app/types";

export const KnowledgeNodeView: React.FC<ExtendedNodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  editor,
  clientRect,
}) => {
  const { selectedItems, isSearching } = node.attrs as KnowledgeNodeAttributes;
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

  const { knowledgeResults: searchResults, isSearchLoading } = useUnifiedSearch(
    {
      owner,
      query: searchQuery,
      pageSize: 10,
      disabled: !searchQuery || searchQuery.length < 2,
      spaceIds,
      viewType: "all",
      includeDataSources: true,
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

  // Convert API results to properly formatted nodes with hierarchy.
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

          return {
            ...rest,
            dataSourceView,
          };
        })
      ),
    [searchResults, spacesMap]
  );

  const knowledgeItems: KnowledgeItem[] = useMemo(() => {
    return dataSourceNodes.map((node) => ({
      id: node.internalId,
      label: node.title,
      description: getLocationForDataSourceViewContentNodeWithSpace(
        node,
        spacesMap
      ),
    }));
  }, [dataSourceNodes, spacesMap]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const item = knowledgeItems[index];
      if (item) {
        updateAttributes({
          selectedItems: [item],
          isSearching: false,
        });
        setIsOpen(false);
        setSelectedIndex(0);
        setSearchQuery("");

        // Return focus to the editor after selection and add a space.
        setTimeout(() => {
          if (editor) {
            editor.chain().focus().insertContent(" ").run();
          }
        }, 10);
      }
    },
    [knowledgeItems, updateAttributes, editor]
  );

  const handleItemClick = useCallback(
    (item: KnowledgeItem) => {
      const index = knowledgeItems.findIndex((i) => i.id === item.id);
      if (index !== -1) {
        handleItemSelect(index);
      }
    },
    [knowledgeItems, handleItemSelect]
  );

  // Listen for input events to update search query and dropdown state.
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLSpanElement>) => {
      const text = e.currentTarget.textContent ?? "";
      setSearchQuery(text);

      if (text.trim()) {
        if (!isOpen) {
          setIsOpen(true);
        }
      } else {
        if (isOpen) {
          setIsOpen(false);
        }
      }
    },
    [isOpen]
  );

  // Auto-focus when node is created or component mounts.
  useEffect(() => {
    if (isSearching && selectedItems.length === 0 && contentRef.current) {
      // Use setTimeout to ensure the DOM is ready.
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();

          // Set cursor at the end of any existing text.
          const range = document.createRange();
          const sel = window.getSelection();
          if (sel) {
            range.selectNodeContents(contentRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 10); // Slightly longer delay to ensure the node is fully rendered.
    }
  }, [isSearching, selectedItems.length]);

  // Additional focus trigger on mount.
  useEffect(() => {
    if (isSearching && selectedItems.length === 0) {
      const focusTimer = setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 50);

      return () => clearTimeout(focusTimer);
    }
  }); // Only run on mount.

  // Reset selected index when items change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [knowledgeItems.length]);

  // Delete empty node helper.
  const deleteIfEmpty = useCallback(
    (delay: number = 50) => {
      setTimeout(() => {
        if (isSearching && selectedItems.length === 0 && !searchQuery.trim()) {
          deleteNode();
        }
      }, delay);
    },
    [isSearching, selectedItems.length, searchQuery, deleteNode]
  );

  // Add global click handler to catch clicks outside when dropdown isn't open.
  useEffect(() => {
    if (!isSearching || selectedItems.length > 0) {
      return;
    }

    const handleGlobalClick = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        deleteIfEmpty(50);
      }
    };

    document.addEventListener("click", handleGlobalClick, true);
    return () => document.removeEventListener("click", handleGlobalClick, true);
  }, [isSearching, selectedItems.length, deleteIfEmpty]);

  // Handle keyboard navigation.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || selectedItems.length > 0) {
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
      } else if (e.key === "Enter" && knowledgeItems.length > 0) {
        e.preventDefault();
        handleItemSelect(selectedIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        deleteNode();
      }
    },
    [
      isOpen,
      selectedItems.length,
      selectedIndex,
      knowledgeItems.length,
      handleItemSelect,
      deleteNode,
    ]
  );

  // Handle blur: delete node if it's empty and in search mode.
  const handleBlur = useCallback(() => {
    deleteIfEmpty(100);
  }, [deleteIfEmpty]);

  // Handle click outside: also delete node if empty.
  const handleInteractOutside = useCallback(() => {
    setIsOpen(false);
    deleteIfEmpty(50);
  }, [deleteIfEmpty]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  if (selectedItems.length > 0) {
    // Show selected knowledge as simple inline text.
    // TODO(2026-01-02 SKILLS): Use the same chip as the url one in the input bar.
    return (
      <NodeViewWrapper className="inline">
        <span className="text-blue-600 dark:text-blue-400">
          📚 {selectedItems[0].label}
        </span>
        <button
          onClick={handleRemove}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600"
          title="Remove knowledge"
        >
          ×
        </button>
      </NodeViewWrapper>
    );
  }

  // Show editable search node.
  return (
    <NodeViewWrapper className="inline">
      <div className="relative inline-block">
        <span
          className={cn(
            "inline-block cursor-text rounded-md bg-gray-100 px-3 py-1 text-sm italic",
            "text-gray-600 empty:before:text-gray-400",
            "empty:before:content-[attr(data-placeholder)] focus:outline-none"
          )}
          contentEditable
          suppressContentEditableWarning
          ref={contentRef}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          data-placeholder="Search for knowledge..."
          style={{
            minWidth: searchQuery ? "auto" : "150px",
            textAlign: "left",
          }}
        ></span>

        {isOpen && knowledgeItems.length > 0 && (
          <DropdownMenu open={true}>
            <DropdownMenuTrigger asChild>
              <div ref={triggerRef} style={virtualTriggerStyle} />
            </DropdownMenuTrigger>
            {/* TODO(2026-01-02 SKILL) Fix dropdow display to avoid overlap with input */}
            <DropdownMenuContent
              className="w-96"
              avoidCollisions={true}
              onInteractOutside={handleInteractOutside}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {isSearchLoading ? (
                <div className="flex items-center justify-center px-4 py-8">
                  <Spinner size="sm" />
                  <span className="ml-2 text-sm text-gray-500">
                    Searching knowledge...
                  </span>
                </div>
              ) : knowledgeItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  {searchQuery.length < 3
                    ? "Type at least 3 characters to search"
                    : "No knowledge found"}
                </div>
              ) : (
                knowledgeItems.map((item, index) => {
                  const node = dataSourceNodes[index];
                  if (!node) {
                    return null;
                  }

                  return (
                    <DropdownMenuItem
                      key={item.id}
                      icon={
                        isWebsite(node.dataSourceView.dataSource) ||
                        isFolder(node.dataSourceView.dataSource) ? (
                          <Icon
                            visual={getVisualForDataSourceViewContentNode(node)}
                            size="md"
                          />
                        ) : (
                          <DoubleIcon
                            size="md"
                            mainIcon={getVisualForDataSourceViewContentNode(
                              node
                            )}
                            secondaryIcon={getConnectorProviderLogoWithFallback(
                              {
                                provider:
                                  node.dataSourceView.dataSource
                                    .connectorProvider,
                              }
                            )}
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
    </NodeViewWrapper>
  );
};
