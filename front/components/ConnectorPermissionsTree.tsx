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
import type {
  BaseContentNode,
  ConnectorPermission,
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useCallback, useContext, useState } from "react";
import React from "react";

import { getVisualForContentNode } from "@app/lib/content_nodes";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { classNames, timeAgoFrom } from "@app/lib/utils";

export type UseResourcesHook = (parentId: string | null) => {
  resources: BaseContentNode[];
  isResourcesLoading: boolean;
  isResourcesError: boolean;
};

export type PermissionTreeNodeStatus = {
  isSelected: boolean;
  node: BaseContentNode;
  parents: string[];
};

type ContextType = {
  // Custom function to determine if a node is checked.
  // This is used to override the default behavior of checking if a node has read or read_write permissions.
  displayDocumentSource?: (documentId: string) => void;
  showExpand?: boolean;
  useResourcesHook: UseResourcesHook;
  treeSelectionModel?: Record<string, PermissionTreeNodeStatus>;
  setTreeSelectionModel?: React.Dispatch<
    React.SetStateAction<Record<string, PermissionTreeNodeStatus>>
  >;
};

const PermissionTreeContext = React.createContext<ContextType | undefined>(
  undefined
);

const PermissionTreeContextProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ContextType;
}) => {
  return (
    <PermissionTreeContext.Provider value={value}>
      {children}
    </PermissionTreeContext.Provider>
  );
};

const usePermissionTreeContext = () => {
  const context = useContext(PermissionTreeContext);
  if (!context) {
    throw new Error(
      "usePermissionTreeChildrenContext must be used within a PermissionTreeChildrenContext"
    );
  }
  return context;
};

interface PermissionTreeChildrenProps {
  isRoundedBackground?: boolean;
  isSearchEnabled?: boolean;
  parentId: string | null;
  parentIsSelected?: boolean;
  breadcrumb: string[];
}

function PermissionTreeChildren({
  isSearchEnabled,
  isRoundedBackground,
  parentIsSelected,
  breadcrumb,
  parentId,
}: PermissionTreeChildrenProps) {
  const { displayDocumentSource, treeSelectionModel, setTreeSelectionModel } =
    usePermissionTreeContext();

  const [search, setSearch] = useState("");
  // This is to control when to dislpay the "Select All" vs "unselect All" button.
  // If the user pressed "select all", we want to display "unselect all" and vice versa.
  // But if the user types in the search bar, we want to reset the button to "select all".
  const [selectAllClicked, setSelectAllClicked] = useState(false);

  const { useResourcesHook } = usePermissionTreeContext();

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
              n.preventSelection !== true && setTreeSelectionModel
                ? {
                    disabled: parentIsSelected,
                    checked: checkedState,
                    onChange: (checked) => {
                      if (checkedState !== "partial") {
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
                {displayDocumentSource && (
                  <IconButton
                    size="xs"
                    icon={BracesIcon}
                    onClick={() => {
                      if (n.dustDocumentId) {
                        displayDocumentSource(n.dustDocumentId);
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
              <PermissionTreeChildren
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

interface PermissionTreeProps {
  isSearchEnabled?: boolean;
  isRoundedBackground?: boolean;
  displayDocumentSource?: (documentId: string) => void;
  customIsNodeChecked?: (node: BaseContentNode) => boolean;
  showExpand?: boolean;
  useResourcesHook: UseResourcesHook;
  treeSelectionModel?: Record<string, PermissionTreeNodeStatus>;
  setTreeSelectionModel?: React.Dispatch<
    React.SetStateAction<Record<string, PermissionTreeNodeStatus>>
  >;
}

export function PermissionTree({
  isSearchEnabled,
  isRoundedBackground,
  useResourcesHook,
  displayDocumentSource,
  treeSelectionModel,
  setTreeSelectionModel,
  showExpand,
}: PermissionTreeProps) {
  return (
    <>
      <PermissionTreeContextProvider
        value={{
          showExpand,
          useResourcesHook,
          treeSelectionModel,
          setTreeSelectionModel,
          displayDocumentSource,
        }}
      >
        <PermissionTreeChildren
          isSearchEnabled={isSearchEnabled}
          isRoundedBackground={isRoundedBackground}
          parentId={null}
          parentIsSelected={false}
          breadcrumb={[]}
        />
      </PermissionTreeContextProvider>
    </>
  );
}

interface DataSourceViewPermissionTreeProps {
  dataSourceView: DataSourceViewType;
  displayDocumentSource: (documentId: string) => void;
  isSearchEnabled?: boolean;
  isRoundedBackground?: boolean;
  owner: LightWorkspaceType;
  parentId?: string | null;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  viewType: ContentNodesViewType;
  treeSelectionModel?: Record<string, PermissionTreeNodeStatus>;
  setTreeSelectionModel?: React.Dispatch<
    React.SetStateAction<Record<string, PermissionTreeNodeStatus>>
  >;
}

export function DataSourceViewPermissionTree({
  dataSourceView,
  isSearchEnabled,
  isRoundedBackground,
  owner,
  displayDocumentSource,
  showExpand,
  viewType,
  treeSelectionModel,
  setTreeSelectionModel,
}: DataSourceViewPermissionTreeProps) {
  const useResourcesHook = (parentId: string | null) => {
    const res = useDataSourceViewContentNodes({
      dataSourceView: dataSourceView,
      owner,
      parentId: parentId ?? undefined,
      viewType,
    });
    return {
      resources: res.nodes,
      isResourcesLoading: res.isNodesLoading,
      isResourcesError: res.isNodesError,
    };
  };

  return (
    <PermissionTree
      isSearchEnabled={isSearchEnabled}
      isRoundedBackground={isRoundedBackground}
      displayDocumentSource={displayDocumentSource}
      showExpand={showExpand}
      useResourcesHook={useResourcesHook}
      treeSelectionModel={treeSelectionModel}
      setTreeSelectionModel={setTreeSelectionModel}
    />
  );
}
