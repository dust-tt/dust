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
import { useCallback, useContext, useState } from "react";
import React from "react";

import { getVisualForContentNode } from "@app/lib/content_nodes";
import { classNames, timeAgoFrom } from "@app/lib/utils";

export type UseResourcesHook = (parentId: string | null) => {
  resources: BaseContentNode[];
  isResourcesLoading: boolean;
  isResourcesError: boolean;
};

export type ContentNodeTreeNodeStatus = {
  isSelected: boolean;
  node: BaseContentNode;
  parents: string[];
};

type TreeSelectionModelUpdater = (
  prev: Record<string, ContentNodeTreeNodeStatus>
) => Record<string, ContentNodeTreeNodeStatus>;

type ContextType = {
  onDocumentViewClick?: (documentId: string) => void;
  showExpand?: boolean;
  useResourcesHook: UseResourcesHook;
  treeSelectionModel?: Record<string, ContentNodeTreeNodeStatus>;
  setTreeSelectionModel?: (updater: TreeSelectionModelUpdater) => void;
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
  isRoundedBackground?: boolean;
  isSearchEnabled?: boolean;
  parentId: string | null;
  parentIsSelected?: boolean;
  breadcrumb: string[];
}

function ContentNodeTreeChildren({
  isSearchEnabled,
  isRoundedBackground,
  parentIsSelected,
  breadcrumb,
  parentId,
}: ContentNodeTreeChildrenProps) {
  const { onDocumentViewClick, treeSelectionModel, setTreeSelectionModel } =
    useContentNodeTreeContext();

  const [search, setSearch] = useState("");
  // This is to control when to dislpay the "Select All" vs "unselect All" button.
  // If the user pressed "select all", we want to display "unselect all" and vice versa.
  // But if the user types in the search bar, we want to reset the button to "select all".
  const [selectAllClicked, setSelectAllClicked] = useState(false);

  const { useResourcesHook } = useContentNodeTreeContext();

  const { resources, isResourcesLoading, isResourcesError } =
    useResourcesHook(parentId);

  const filteredNodes = resources.filter(
    (n) => search.trim().length === 0 || n.title.includes(search)
  );

  const getCheckedState = useCallback(
    (node: BaseContentNode) => {
      if (!treeSelectionModel) {
        return "unchecked";
      }

      // If the parent is selected, the node is considered selected.
      if (parentIsSelected) {
        return "checked";
      }

      // Check if there is a local state for this node.
      const localState = treeSelectionModel[node.internalId];
      if (localState?.isSelected) {
        return "checked";
      }

      const internalPartiallySelectedId = Object.values(treeSelectionModel)
        .map((status) => status.parents)
        .flat();
      if (internalPartiallySelectedId.includes(node.internalId)) {
        return "partial";
      }

      // Return false if no custom function is provided.
      return "unchecked";
    },
    [parentIsSelected, treeSelectionModel]
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
      {filteredNodes.map((n, i) => {
        const checkedState = getCheckedState(n);

        return (
          <Tree.Item
            key={n.internalId}
            type={n.expandable ? "node" : "leaf"}
            label={n.title}
            visual={getVisualForContentNode(n)}
            className="whitespace-nowrap"
            checkbox={
              n.preventSelection !== true && treeSelectionModel
                ? {
                    disabled: parentIsSelected || !setTreeSelectionModel,
                    checked: checkedState,
                    onChange: (checked) => {
                      if (checkedState !== "partial" && setTreeSelectionModel) {
                        setTreeSelectionModel((prev) => ({
                          ...prev,
                          [n.internalId]: {
                            isSelected: checked,
                            node: n,
                            parents: checked ? breadcrumb : [],
                          },
                        }));
                      }
                    },
                  }
                : undefined
            }
            actions={
              <div className="mr-8 flex flex-row gap-2">
                {n.lastUpdatedAt ? (
                  <Tooltip
                    contentChildren={
                      <span>{new Date(n.lastUpdatedAt).toLocaleString()}</span>
                    }
                    position={i === 0 ? "below" : "above"}
                  >
                    <span className="text-xs text-gray-500">
                      {timeAgoFrom(n.lastUpdatedAt)} ago
                    </span>
                  </Tooltip>
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
                parentId={n.internalId}
                parentIsSelected={getCheckedState(n) === "checked"}
                breadcrumb={[n.internalId, ...breadcrumb]}
              />
            )}
          />
        );
      })}
    </Tree>
  );

  return (
    <>
      {isSearchEnabled && setTreeSelectionModel && (
        <>
          <div className="flex w-full flex-row items-center">
            <div className="flex-grow p-1">
              <Searchbar
                placeholder="Search..."
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setSelectAllClicked(false);
                }}
                name="search"
              />
            </div>

            <div className="p-1">
              <Button
                variant="tertiary"
                size="sm"
                label={selectAllClicked ? "Unselect All" : "Select All"}
                icon={ListCheckIcon}
                disabled={search.trim().length === 0}
                onClick={() => {
                  const isSelected = !selectAllClicked;
                  setSelectAllClicked(isSelected);
                  setTreeSelectionModel((prev) => {
                    const newState = { ...prev };
                    filteredNodes.forEach((n) => {
                      newState[n.internalId] = {
                        isSelected,
                        node: n,
                        parents: isSelected ? breadcrumb : [],
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
  isSearchEnabled?: boolean;
  isRoundedBackground?: boolean;
  onDocumentViewClick?: (documentId: string) => void;
  customIsNodeChecked?: (node: BaseContentNode) => boolean;
  showExpand?: boolean;
  useResourcesHook: UseResourcesHook;
  treeSelectionModel?: Record<string, ContentNodeTreeNodeStatus>;
  setTreeSelectionModel?: (updater: TreeSelectionModelUpdater) => void;
}

export function ContentNodeTree({
  isSearchEnabled,
  isRoundedBackground,
  useResourcesHook,
  onDocumentViewClick,
  treeSelectionModel,
  setTreeSelectionModel,
  showExpand,
}: ContentNodeTreeProps) {
  return (
    <>
      <ContentNodeTreeContextProvider
        value={{
          showExpand,
          useResourcesHook,
          treeSelectionModel,
          setTreeSelectionModel,
          onDocumentViewClick,
        }}
      >
        <ContentNodeTreeChildren
          isSearchEnabled={isSearchEnabled}
          isRoundedBackground={isRoundedBackground}
          parentId={null}
          parentIsSelected={false}
          breadcrumb={[]}
        />
      </ContentNodeTreeContextProvider>
    </>
  );
}
