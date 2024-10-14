import {
  BracesIcon,
  Button,
  ExternalLinkIcon,
  IconButton,
  ListCheckIcon,
  Searchbar,
  Tooltip,
  Tree,
} from "@dust-tt/sparkle";
import type { BaseContentNode } from "@dust-tt/types";
import type { ReactNode } from "react";
import React, { useCallback, useContext, useState } from "react";

import { getVisualForContentNode } from "@app/lib/content_nodes";
import { classNames, timeAgoFrom } from "@app/lib/utils";

const unselectedChildren = (
  selection: Record<string, ContentNodeTreeItemStatus>,
  node: BaseContentNode
) =>
  Object.entries(selection).reduce((acc, [k, v]) => {
    const shouldUnselect = v.parents.includes(node.internalId);
    return {
      ...acc,
      [k]: {
        ...v,
        parents: shouldUnselect ? [] : v.parents,
        isSelected: v.isSelected && !shouldUnselect,
      },
    };
  }, {});

export type UseResourcesHook = (parentId: string | null) => {
  resources: BaseContentNode[];
  isResourcesLoading: boolean;
  isResourcesError: boolean;
};

export type ContentNodeTreeItemStatus = {
  isSelected: boolean;
  node: BaseContentNode;
  parents: string[];
};

export type TreeSelectionModelUpdater = (
  prev: Record<string, ContentNodeTreeItemStatus>
) => Record<string, ContentNodeTreeItemStatus>;

type ContextType = {
  onDocumentViewClick?: (documentId: string) => void;
  selectedNodes?: Record<string, ContentNodeTreeItemStatus>;
  setSelectedNodes?: (updater: TreeSelectionModelUpdater) => void;
  showExpand?: boolean;
  useResourcesHook: UseResourcesHook;
  emptyComponent: ReactNode;
};

const ContentNodeTreeContext = React.createContext<ContextType | undefined>(
  undefined
);

const ContentNodeTreeContextProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ContextType;
}) => {
  return (
    <ContentNodeTreeContext.Provider value={value}>
      {children}
    </ContentNodeTreeContext.Provider>
  );
};

const useContentNodeTreeContext = () => {
  const context = useContext(ContentNodeTreeContext);
  if (!context) {
    throw new Error(
      "useContentNodeTreeContext must be used within a ContentNodeTreeContext"
    );
  }
  return context;
};

interface ContentNodeTreeChildrenProps {
  depth: number;
  isRoundedBackground?: boolean;
  isSearchEnabled?: boolean;
  parentId: string | null;
  parentIds: string[];
  parentIsSelected?: boolean;
}

function ContentNodeTreeChildren({
  depth,
  isRoundedBackground,
  isSearchEnabled,
  parentId,
  parentIds,
  parentIsSelected,
}: ContentNodeTreeChildrenProps) {
  const { onDocumentViewClick, selectedNodes, setSelectedNodes } =
    useContentNodeTreeContext();

  const [search, setSearch] = useState("");
  // This is to control when to dislpay the "Select All" vs "unselect All" button.
  // If the user pressed "select all", we want to display "unselect all" and vice versa.
  // But if the user types in the search bar, we want to reset the button to "select all".
  const [selectAllClicked, setSelectAllClicked] = useState(false);

  const { useResourcesHook, emptyComponent } = useContentNodeTreeContext();

  const { resources, isResourcesLoading, isResourcesError } =
    useResourcesHook(parentId);

  const filteredNodes = resources.filter(
    (n) => search.trim().length === 0 || n.title.includes(search)
  );

  const getCheckedState = useCallback(
    (node: BaseContentNode) => {
      if (!selectedNodes) {
        return "unchecked";
      }

      // If the parent is selected, the node is considered selected.
      if (parentIsSelected) {
        return "checked";
      }

      // Check if there is a local state for this node.
      const localState = selectedNodes[node.internalId];
      if (localState?.isSelected) {
        return "checked";
      }

      const internalPartiallySelectedId = Object.values(selectedNodes)
        .map((status) => status.parents)
        .flat();
      if (internalPartiallySelectedId.includes(node.internalId)) {
        return "partial";
      }

      // Return false if no custom function is provided.
      return "unchecked";
    },
    [parentIsSelected, selectedNodes]
  );

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  const tree = (
    <Tree isLoading={isResourcesLoading}>
      {filteredNodes &&
        filteredNodes.length === 0 &&
        (emptyComponent || <Tree.Empty label="No documents" />)}

      {filteredNodes.map((n, i) => {
        const checkedState = getCheckedState(n);

        return (
          <Tree.Item
            key={n.internalId}
            type={n.expandable ? "node" : "leaf"}
            label={n.title}
            visual={getVisualForContentNode(n)}
            className={`whitespace-nowrap tree-depth-${depth}`}
            checkbox={
              (n.preventSelection !== true || checkedState === "partial") &&
              selectedNodes
                ? {
                    disabled: parentIsSelected || !setSelectedNodes,
                    checked: checkedState,
                    onChange: (checked) => {
                      if (setSelectedNodes) {
                        if (checkedState === "partial") {
                          // Handle clicking on partial : unselect all selected children
                          setSelectedNodes((prev) =>
                            unselectedChildren(prev, n)
                          );
                        } else {
                          setSelectedNodes((prev) => ({
                            ...prev,
                            [n.internalId]: {
                              isSelected: checked,
                              node: n,
                              parents: checked ? parentIds : [],
                            },
                          }));
                        }
                      }
                    },
                  }
                : undefined
            }
            actions={
              <div className="mr-8 flex flex-row gap-2">
                {n.lastUpdatedAt ? (
                  <Tooltip
                    label={
                      <span>{new Date(n.lastUpdatedAt).toLocaleString()}</span>
                    }
                    side={i === 0 ? "bottom" : "top"}
                    trigger={
                      <span className="text-xs text-gray-500">
                        {timeAgoFrom(n.lastUpdatedAt)} ago
                      </span>
                    }
                  />
                ) : null}
                <IconButton
                  size="xs"
                  icon={ExternalLinkIcon}
                  onClick={() => {
                    if (n.sourceUrl) {
                      window.open(n.sourceUrl, "_blank");
                    }
                  }}
                  className={classNames(
                    n.sourceUrl ? "" : "pointer-events-none opacity-0"
                  )}
                  disabled={!n.sourceUrl}
                  variant="tertiary"
                />
                {onDocumentViewClick && (
                  <IconButton
                    size="xs"
                    icon={BracesIcon}
                    onClick={() => {
                      if (n.dustDocumentId) {
                        onDocumentViewClick(n.dustDocumentId);
                      }
                    }}
                    className={classNames(
                      n.dustDocumentId ? "" : "pointer-events-none opacity-0"
                    )}
                    disabled={!n.dustDocumentId}
                    variant="tertiary"
                  />
                )}
              </div>
            }
            renderTreeItems={() => (
              <ContentNodeTreeChildren
                depth={depth + 1}
                parentId={n.internalId}
                parentIds={[n.internalId, ...parentIds]}
                parentIsSelected={getCheckedState(n) === "checked"}
              />
            )}
          />
        );
      })}
    </Tree>
  );

  return (
    <>
      {isSearchEnabled && setSelectedNodes && (
        <>
          <div className="flex w-full flex-row items-center">
            <div className="flex-grow p-1">
              <Searchbar
                name="search"
                placeholder="Search..."
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setSelectAllClicked(false);
                }}
              />
            </div>

            <div className="p-1">
              <Button
                disabled={search.trim().length === 0}
                icon={ListCheckIcon}
                label={selectAllClicked ? "Unselect All" : "Select All"}
                size="sm"
                variant="tertiary"
                onClick={() => {
                  const isSelected = !selectAllClicked;
                  setSelectAllClicked(isSelected);
                  setSelectedNodes((prev) => {
                    const newState = { ...prev };
                    filteredNodes.forEach((n) => {
                      newState[n.internalId] = {
                        isSelected,
                        node: n,
                        parents: isSelected ? parentIds : [],
                      };
                    });
                    return newState;
                  });
                }}
              />
            </div>
          </div>
        </>
      )}
      <div className="overflow-y-auto p-1">
        {isRoundedBackground ? (
          <div className="rounded-xl border bg-structure-50 p-4">{tree}</div>
        ) : (
          tree
        )}
      </div>
    </>
  );
}

interface ContentNodeTreeProps {
  /**
   * If true, the tree will have a rounded background.
   */
  isRoundedBackground?: boolean;
  /**
   * If true, a search bar will be displayed at the top of the tree.
   */
  isSearchEnabled?: boolean;
  /**
   * Whole tree will be considered selected and disabled.
   */
  parentIsSelected?: boolean;
  /**
   * Callback when the user clicks on the "view document" action
   * If undefined, the action will not be displayed.
   */
  onDocumentViewClick?: (documentId: string) => void;
  /**
   * The current nodes selection.
   * If undefined, no checkbox will be displayed.
   */
  selectedNodes?: Record<string, ContentNodeTreeItemStatus>;
  /**
   * This function is called when the user selects or unselects a node.
   * If undefined, the tree will be read-only.
   */
  setSelectedNodes?: (updater: TreeSelectionModelUpdater) => void;
  /**
   * If true, the expand/collapse buttons will be displayed.
   */
  showExpand?: boolean;
  /**
   * The hook to fetch the resources under a given parent.
   */
  useResourcesHook: UseResourcesHook;
  /**
   * The component to display when an item is expanded and it has no children.
   */
  emptyComponent?: ReactNode;
}

export function ContentNodeTree({
  isRoundedBackground,
  isSearchEnabled,
  onDocumentViewClick,
  parentIsSelected,
  selectedNodes,
  setSelectedNodes,
  showExpand,
  useResourcesHook,
  emptyComponent,
}: ContentNodeTreeProps) {
  return (
    <ContentNodeTreeContextProvider
      value={{
        onDocumentViewClick,
        selectedNodes,
        setSelectedNodes,
        showExpand,
        useResourcesHook,
        emptyComponent,
      }}
    >
      <ContentNodeTreeChildren
        depth={0}
        isRoundedBackground={isRoundedBackground}
        isSearchEnabled={isSearchEnabled}
        parentId={null}
        parentIds={[]}
        parentIsSelected={parentIsSelected ?? false}
      />
    </ContentNodeTreeContextProvider>
  );
}
