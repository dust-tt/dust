import type { NotificationType } from "@dust-tt/sparkle";
import {
  BracesIcon,
  Button,
  ExternalLinkIcon,
  HistoryIcon,
  Icon,
  IconButton,
  ListCheckIcon,
  SearchInput,
  Tooltip,
  Tree,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FixedSizeList as List } from "react-window";

import { useSendNotification } from "@app/hooks/useNotification";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import type { APIError, ContentNode } from "@app/types";

const unselectedChildren = (
  selection: Record<string, VirtualizedContentNodeTreeItemStatus>,
  node: ContentNode,
  sendNotification: (notification: NotificationType) => void
) => {
  if (Object.entries(selection).some(([, v]) => v.parents === null)) {
    sendNotification({
      type: "error",
      title: "Deselecting partial selection unavailable.",
      description:
        "Please deselect manually each node you want to unselect. This is due to nodes not being fully synchronized yet",
    });
    return selection;
  }

  return Object.entries(selection).reduce((acc, [k, v]) => {
    // we checked above all parents were not null
    const shouldUnselect = v.parents?.includes(node.internalId);
    return {
      ...acc,
      [k]: {
        ...v,
        parents: shouldUnselect ? [] : v.parents,
        isSelected: v.isSelected && !shouldUnselect,
      },
    };
  }, {});
};

export type VirtualizedUseResourcesHook = (parentId: string | null) => {
  resources: ContentNode[];
  totalResourceCount?: number;
  isResourcesLoading: boolean;
  isResourcesError: boolean;
  isResourcesTruncated?: boolean;
  resourcesError?: APIError | null;
  nextPageCursor?: string | null;
  loadMore?: () => void;
  isLoadingMore?: boolean;
};

export type VirtualizedContentNodeTreeItemStatus<T extends ContentNode = ContentNode> = {
  isSelected: boolean;
  node: T;
  parents: string[];
};

export type VirtualizedTreeSelectionModelUpdater = (
  prev: Record<string, VirtualizedContentNodeTreeItemStatus>
) => Record<string, VirtualizedContentNodeTreeItemStatus>;

type VirtualizedContextType = {
  onDocumentViewClick?: (documentId: string) => void;
  selectedNodes?: Record<string, VirtualizedContentNodeTreeItemStatus>;
  setSelectedNodes?: (updater: VirtualizedTreeSelectionModelUpdater) => void;
  showExpand?: boolean;
  useResourcesHook: VirtualizedUseResourcesHook;
  emptyComponent: ReactNode;
  defaultExpandedIds?: string[];
  allResources: ContentNode[];
  filteredResources: ContentNode[];
  parentIds: string[];
  getCheckedState: (node: ContentNode) => boolean | "partial";
  parentIsSelected: boolean;
};

const VirtualizedContentNodeTreeContext = React.createContext<VirtualizedContextType | undefined>(
  undefined
);

const VirtualizedContentNodeTreeContextProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: VirtualizedContextType;
}) => {
  return (
    <VirtualizedContentNodeTreeContext.Provider value={value}>
      {children}
    </VirtualizedContentNodeTreeContext.Provider>
  );
};

const useVirtualizedContentNodeTreeContext = () => {
  const context = useContext(VirtualizedContentNodeTreeContext);
  if (!context) {
    throw new Error(
      "useVirtualizedContentNodeTreeContext must be used within a VirtualizedContentNodeTreeContext"
    );
  }
  return context;
};

interface VirtualizedTreeItemProps {
  index: number;
  style: React.CSSProperties;
}

function VirtualizedTreeItem({ index, style }: VirtualizedTreeItemProps) {
  const {
    onDocumentViewClick,
    selectedNodes,
    setSelectedNodes,
    filteredResources,
    parentIds,
    getCheckedState,
    parentIsSelected,
  } = useVirtualizedContentNodeTreeContext();

  const sendNotification = useSendNotification();
  const node = filteredResources[index];

  if (!node) {
    return null;
  }

  const checkedState = getCheckedState(node);

  return (
    <div style={style}>
      <Tree.Item
        key={node.internalId}
        id={`tree-node-${node.internalId}`}
        type="leaf"
        label={node.title}
        labelClassName={
          node.providerVisibility === "private"
            ? "after:content-['(private)'] after:text-warning after:ml-1"
            : ""
        }
        visual={getVisualForContentNode(node)}
        className="whitespace-nowrap"
        checkbox={
          (node.preventSelection !== true || checkedState === "partial") &&
          selectedNodes
            ? {
                disabled: parentIsSelected || !setSelectedNodes,
                checked: checkedState,
                onCheckedChange: (v) => {
                  if (setSelectedNodes) {
                    if (checkedState === "partial") {
                      setSelectedNodes((prev) =>
                        unselectedChildren(prev, node, sendNotification)
                      );
                    } else {
                      setSelectedNodes((prev) => ({
                        ...prev,
                        [node.internalId]: {
                          isSelected: v === "indeterminate" ? true : v,
                          node: node,
                          parents: v ? parentIds : [],
                        },
                      }));
                    }
                  }
                },
              }
            : undefined
        }
        actions={
          <div className="mr-8 flex grow flex-row justify-between gap-2">
            {node.sourceUrl && (
              <Button
                href={node.sourceUrl}
                icon={ExternalLinkIcon}
                size="xs"
                variant="outline"
              />
            )}
            {node.lastUpdatedAt ? (
              <Tooltip
                label={
                  <span>{new Date(node.lastUpdatedAt).toLocaleString()}</span>
                }
                side={index === 0 ? "bottom" : "top"}
                trigger={
                  <div className="flex flex-row gap-1 text-gray-600">
                    <Icon visual={HistoryIcon} size="xs" />
                    <span className="text-xs">
                      {timeAgoFrom(node.lastUpdatedAt)} ago
                    </span>
                  </div>
                }
              />
            ) : null}
            {onDocumentViewClick && (
              <IconButton
                size="xs"
                icon={BracesIcon}
                onClick={() => {
                  if (node.type === "document") {
                    onDocumentViewClick(node.internalId);
                  }
                }}
                className={classNames(
                  node.type === "document"
                    ? ""
                    : "pointer-events-none opacity-0"
                )}
                disabled={node.type !== "document"}
                variant="outline"
              />
            )}
          </div>
        }
      />
    </div>
  );
}

interface VirtualizedContentNodeTreeChildrenProps {
  parentId: string | null;
  parentIds: string[];
  parentIsSelected?: boolean;
  isRoundedBackground?: boolean;
  isTitleFilterEnabled?: boolean;
}

function VirtualizedContentNodeTreeChildren({
  parentId,
  parentIds,
  parentIsSelected,
  isRoundedBackground,
  isTitleFilterEnabled,
}: VirtualizedContentNodeTreeChildrenProps) {
  const { selectedNodes, setSelectedNodes } = useVirtualizedContentNodeTreeContext();

  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [selectAllClicked, setSelectAllClicked] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Debounce the search filter to prevent lag during typing
  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedFilter(filter);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [filter]);

  const { useResourcesHook, emptyComponent } = useVirtualizedContentNodeTreeContext();

  const {
    resources,
    isResourcesLoading,
    isResourcesError,
    resourcesError,
    nextPageCursor,
    loadMore,
    isLoadingMore,
  } = useResourcesHook(parentId);

  // Pre-compute searchable index for faster filtering
  const searchableResources = useMemo(() => {
    return resources.map((resource) => ({
      ...resource,
      searchableTitle: resource.title.toLowerCase(),
    }));
  }, [resources]);

  // Implement lazy loading: only process initial batch, then load more on scroll
  const [visibleCount, setVisibleCount] = useState(Math.min(100, searchableResources.length));
  
  useEffect(() => {
    // Reset visible count when resources change
    setVisibleCount(Math.min(100, searchableResources.length));
  }, [searchableResources.length]);

  // Optimize filtering with debounced search and pre-computed searchable index
  const filteredResources = useMemo(() => {
    const baseResources = debouncedFilter.trim().length === 0 
      ? searchableResources 
      : searchableResources.filter((n) => 
          n.searchableTitle.includes(debouncedFilter.toLowerCase())
        );
    
    // For initial load, only return the visible subset
    return baseResources.slice(0, visibleCount);
  }, [searchableResources, debouncedFilter, visibleCount]);

  // Handle scroll to load more items
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
    
    if (isNearBottom && visibleCount < searchableResources.length) {
      setVisibleCount(prev => Math.min(prev + 100, searchableResources.length));
    }
  }, [visibleCount, searchableResources.length]);

  const getCheckedState = useCallback(
    (node: ContentNode) => {
      if (!selectedNodes) {
        return false;
      }

      if (parentIsSelected) {
        return true;
      }

      const localState = selectedNodes[node.internalId];
      if (localState?.isSelected) {
        return true;
      }

      const internalPartiallySelectedId = Object.values(selectedNodes)
        .map((status) => status.parents)
        .flat();
      if (internalPartiallySelectedId.includes(node.internalId)) {
        return "partial";
      }

      return false;
    },
    [parentIsSelected, selectedNodes]
  );

  const handleSelectAll = useCallback(() => {
    if (!setSelectedNodes) {
      return;
    }

    const isSelected = !selectAllClicked;
    setSelectAllClicked(isSelected);

    if (debouncedFilter.trim().length > 0) {
      // Only select filtered items
      setSelectedNodes((prev) => {
        const newState = { ...prev };
        filteredResources.forEach((n) => {
          newState[n.internalId] = {
            isSelected,
            node: n,
            parents: isSelected ? parentIds : [],
          };
        });
        return newState;
      });
    } else {
      // Select all resources
      setSelectedNodes((prev) => {
        const newState = { ...prev };
        resources.forEach((n) => {
          newState[n.internalId] = {
            isSelected,
            node: n,
            parents: isSelected ? parentIds : [],
          };
        });
        return newState;
      });
    }
  }, [selectAllClicked, debouncedFilter, filteredResources, resources, setSelectedNodes, parentIds]);

  const contextValue = useMemo(
    () => ({
      onDocumentViewClick: undefined,
      selectedNodes,
      setSelectedNodes,
      showExpand: false,
      useResourcesHook,
      emptyComponent,
      defaultExpandedIds: [],
      allResources: resources,
      filteredResources,
      parentIds,
      getCheckedState,
      parentIsSelected: parentIsSelected ?? false,
    }),
    [
      selectedNodes,
      setSelectedNodes,
      useResourcesHook,
      emptyComponent,
      resources,
      filteredResources,
      parentIds,
      getCheckedState,
      parentIsSelected,
    ]
  );

  if (isResourcesError) {
    return (
      <div className="text-sm text-warning">
        {resourcesError?.type === "rate_limit_error" ? (
          <>Connected service's API limit reached. Please retry shortly.</>
        ) : (
          <>
            Failed to retrieve permissions likely due to a revoked
            authorization.
          </>
        )}
      </div>
    );
  }

  return (
    <VirtualizedContentNodeTreeContextProvider value={contextValue}>
      <>
        {isTitleFilterEnabled && setSelectedNodes && (
          <>
            <div className="flex w-full flex-row items-center">
              <div className="flex-grow p-1">
                <SearchInput
                  name="search"
                  placeholder="Search"
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    setSelectAllClicked(false);
                  }}
                />
              </div>

              <Button
                icon={ListCheckIcon}
                label={selectAllClicked ? "Unselect All" : "Select All"}
                size="sm"
                className="m-1"
                variant="ghost"
                onClick={handleSelectAll}
              />
            </div>
          </>
        )}
        <div className="overflow-y-auto p-1" style={{ height: "600px" }} onScroll={handleScroll}>
          <Tree isLoading={isResourcesLoading || isSearching} isBoxed={isRoundedBackground}>
            {filteredResources.length === 0 && !isResourcesLoading && !isSearching && (
              emptyComponent || <Tree.Empty label={debouncedFilter ? "No channels found" : "No documents"} />
            )}
            
            {filteredResources.length > 0 && !isSearching && (
              <List
                height={600}
                width="100%"
                itemCount={filteredResources.length}
                itemSize={60}
                overscanCount={20}
              >
                {VirtualizedTreeItem}
              </List>
            )}
            
            {isSearching && (
              <div className="flex items-center justify-center h-20 text-gray-500">
                Searching...
              </div>
            )}
          </Tree>
          {/* Show loading indicator when more items are available */}
          {visibleCount < searchableResources.length && (
            <div className="mt-2 flex flex-col items-center py-2">
              <div className="mb-2 text-center text-xs text-gray-500">
                {`Showing ${visibleCount} of ${searchableResources.length} items`}
              </div>
              <Button
                variant="secondary"
                size="sm"
                label="Load More"
                onClick={() => {
                  setVisibleCount(prev => Math.min(prev + 100, searchableResources.length));
                }}
              />
            </div>
          )}
          {nextPageCursor && (
            <div className="mt-2 flex flex-col items-center py-2">
              <Button
                variant="secondary"
                size="sm"
                label={isLoadingMore ? "Loading..." : "Load More"}
                disabled={isResourcesLoading || isLoadingMore}
                onClick={() => {
                  if (loadMore) {
                    loadMore();
                  }
                }}
              />
            </div>
          )}
        </div>
      </>
    </VirtualizedContentNodeTreeContextProvider>
  );
}

interface VirtualizedContentNodeTreeProps {
  isRoundedBackground?: boolean;
  isTitleFilterEnabled?: boolean;
  parentIsSelected?: boolean;
  onDocumentViewClick?: (documentId: string) => void;
  selectedNodes?: Record<string, VirtualizedContentNodeTreeItemStatus>;
  setSelectedNodes?: (updater: VirtualizedTreeSelectionModelUpdater) => void;
  showExpand?: boolean;
  useResourcesHook: VirtualizedUseResourcesHook;
  emptyComponent?: ReactNode;
  defaultExpandedIds?: string[];
}

export function VirtualizedContentNodeTree({
  isRoundedBackground,
  isTitleFilterEnabled,
  onDocumentViewClick,
  parentIsSelected,
  selectedNodes,
  setSelectedNodes,
  showExpand,
  useResourcesHook,
  emptyComponent,
  defaultExpandedIds,
}: VirtualizedContentNodeTreeProps) {
  const contextValue = useMemo(
    () => ({
      onDocumentViewClick,
      selectedNodes,
      setSelectedNodes,
      showExpand,
      useResourcesHook,
      emptyComponent,
      defaultExpandedIds,
      allResources: [],
      filteredResources: [],
      parentIds: [],
      getCheckedState: () => false as const,
      parentIsSelected: parentIsSelected ?? false,
    }),
    [
      onDocumentViewClick,
      selectedNodes,
      setSelectedNodes,
      showExpand,
      useResourcesHook,
      emptyComponent,
      defaultExpandedIds,
      parentIsSelected,
    ]
  );

  return (
    <VirtualizedContentNodeTreeContextProvider value={contextValue}>
      <VirtualizedContentNodeTreeChildren
        parentId={null}
        parentIds={[]}
        parentIsSelected={parentIsSelected ?? false}
        isRoundedBackground={isRoundedBackground}
        isTitleFilterEnabled={isTitleFilterEnabled}
      />
    </VirtualizedContentNodeTreeContextProvider>
  );
}