import {
  BracesIcon,
  Button,
  ExternalLinkIcon,
  IconButton,
  Input,
  ListCheckIcon,
  Tooltip,
  Tree,
} from "@dust-tt/sparkle";
import type {
  BaseContentNode,
  ConnectorProvider,
  DataSourceType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import type { ConnectorPermission } from "@dust-tt/types";
import { useCallback, useState } from "react";

import ManagedDataSourceDocumentModal from "@app/components/ManagedDataSourceDocumentModal";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import {
  useConnectorPermissions,
  useDataSourceViewContentNodeChildren,
} from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";

const CONNECTOR_TYPE_TO_PERMISSIONS: Record<
  ConnectorProvider,
  { selected: ConnectorPermission; unselected: ConnectorPermission } | undefined
> = {
  confluence: {
    selected: "read",
    unselected: "none",
  },
  slack: {
    selected: "read_write",
    unselected: "write",
  },
  google_drive: {
    selected: "read",
    unselected: "none",
  },
  microsoft: {
    selected: "read",
    unselected: "none",
  },
  notion: undefined,
  github: undefined,
  intercom: {
    selected: "read",
    unselected: "none",
  },
  webcrawler: undefined,
};

type onPermissionUpdateType = (
  node: BaseContentNode,
  { newPermission }: { newPermission: ConnectorPermission }
) => void;

interface PermissionTreeChildrenBaseProps {
  canUpdatePermissions?: boolean;
  customIsNodeChecked?: (node: BaseContentNode) => boolean;
  displayDocumentSource: (documentId: string) => void;
  onPermissionUpdate?: onPermissionUpdateType;
  isSearchEnabled: boolean;
  owner: LightWorkspaceType;
  parentId: string | null;
  parentIsSelected?: boolean;
  showExpand?: boolean;
}

type DataSourcePermissionTreeChildrenProps = PermissionTreeChildrenBaseProps & {
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  useConnectorPermissionsHook: typeof useConnectorPermissions;
};

export function DataSourcePermissionTreeChildren({
  customIsNodeChecked,
  dataSource,
  owner,
  parentId,
  permissionFilter,
  useConnectorPermissionsHook,
  ...props
}: DataSourcePermissionTreeChildrenProps) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissionsHook({
      owner,
      dataSource,
      parentId,
      filterPermission: permissionFilter || null,
    });

  // For data source permissions, we rely on the permission field to determine if a node is checked.
  const isNodeChecked = useCallback(
    (node: BaseContentNode) => {
      if (customIsNodeChecked) {
        return customIsNodeChecked(node);
      }

      return ["read", "read_write"].includes(node.permission);
    },
    [customIsNodeChecked]
  );

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  return (
    <div className="border-2 border-red-500">
      <PermissionTreeChildren
        dataSource={dataSource}
        isNodeChecked={isNodeChecked}
        isLoading={isResourcesLoading}
        nodes={resources}
        owner={owner}
        parentId={parentId}
        renderChildItem={(node: BaseContentNode, { isParentNodeSelected }) => (
          <DataSourcePermissionTreeChildren
            dataSource={dataSource}
            owner={owner}
            parentId={node.internalId}
            parentIsSelected={isParentNodeSelected}
            permissionFilter={permissionFilter}
            useConnectorPermissionsHook={useConnectorPermissionsHook}
            {...props}
            // Disable search for children.
            isSearchEnabled={false}
          />
        )}
        {...props}
      />
    </div>
  );
}

type DataSourceViewPermissionTreeChildrenProps =
  PermissionTreeChildrenBaseProps & {
    dataSourceView: DataSourceViewType;
    permissionFilter?: ConnectorPermission;
  };

export function DataSourceViewPermissionTreeChildren({
  dataSourceView,
  owner,
  parentId,
  ...props
}: DataSourceViewPermissionTreeChildrenProps) {
  const { nodes, isNodesLoading, isNodesError } =
    useDataSourceViewContentNodeChildren({
      owner,
      dataSourceView,
      parentInternalId: parentId,
    });

  if (isNodesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  const { dataSource } = dataSourceView;

  return (
    <div className="border-2 border-green-500">
      <PermissionTreeChildren
        dataSource={dataSource}
        isLoading={isNodesLoading}
        nodes={nodes}
        owner={owner}
        parentId={parentId}
        renderChildItem={(node: BaseContentNode, { isParentNodeSelected }) => (
          <DataSourceViewPermissionTreeChildren
            dataSourceView={dataSourceView}
            owner={owner}
            parentId={node.internalId}
            parentIsSelected={isParentNodeSelected}
            {...props}
            // Disable search for children.
            isSearchEnabled={false}
          />
        )}
        {...props}
      />
    </div>
  );
}

type PermissionTreeChildrenProps = PermissionTreeChildrenBaseProps & {
  dataSource: DataSourceType;
  isLoading: boolean;
  isNodeChecked?: (node: BaseContentNode) => boolean;
  nodes: BaseContentNode[];
  renderChildItem: (
    r: BaseContentNode,
    { isParentNodeSelected }: { isParentNodeSelected: boolean }
  ) => React.ReactNode;
};

function PermissionTreeChildren({
  canUpdatePermissions,
  dataSource,
  displayDocumentSource,
  isLoading,
  isNodeChecked,
  isSearchEnabled,
  nodes,
  onPermissionUpdate,
  parentIsSelected,
  renderChildItem,
}: PermissionTreeChildrenProps) {
  const [search, setSearch] = useState("");
  // This is to control when to dislpay the "Select All" vs "unselect All" button.
  // If the user pressed "select all", we want to display "unselect all" and vice versa.
  // But if the user types in the search bar, we want to reset the button to "select all".
  const [selectAllClicked, setSelectAllClicked] = useState(false);

  const [localStateByInternalId, setLocalStateByInternalId] = useState<
    Record<string, boolean>
  >({});

  const selectedPermission: ConnectorPermission =
    (dataSource.connectorProvider &&
      CONNECTOR_TYPE_TO_PERMISSIONS[dataSource.connectorProvider]?.selected) ||
    "none";
  const unselectedPermission: ConnectorPermission =
    (dataSource.connectorProvider &&
      CONNECTOR_TYPE_TO_PERMISSIONS[dataSource.connectorProvider]
        ?.unselected) ||
    "none";

  const filteredNodes = nodes.filter(
    (n) => search.trim().length === 0 || n.title.includes(search)
  );

  function isNodeSelected(node: BaseContentNode) {
    // If the parent is selected, the node is considered selected.
    if (parentIsSelected) {
      return true;
    }

    // Check if there is a local state for this node.
    const localState = localStateByInternalId[node.internalId];
    if (localState !== undefined) {
      return localState;
    }

    // If a custom isNodeChecked function is provided, use it.
    if (isNodeChecked) {
      return isNodeChecked(node);
    }

    // Return false if no custom function is provided.
    return false;
  }

  return (
    <>
      {isSearchEnabled && (
        <>
          <div className="flex w-full flex-row">
            <div className="w-5"></div>

            <div className="mr-8 flex-grow p-1">
              <Input
                placeholder="Search..."
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setSelectAllClicked(false);
                }}
                size="sm"
                name="search"
              />
            </div>
          </div>
          <div className="flex w-full flex-row justify-end">
            <div className="mr-8 p-1">
              <Button
                variant="tertiary"
                size="sm"
                label={selectAllClicked ? "Unselect All" : "Select All"}
                icon={ListCheckIcon}
                disabled={search.trim().length === 0}
                onClick={() => {
                  setSelectAllClicked((prev) => !prev);
                  setLocalStateByInternalId((prev) => {
                    const newState = { ...prev };
                    filteredNodes.forEach((n) => {
                      newState[n.internalId] = !selectAllClicked;
                    });
                    return newState;
                  });
                  if (onPermissionUpdate) {
                    filteredNodes.forEach((n) => {
                      onPermissionUpdate(n, {
                        newPermission: !selectAllClicked
                          ? selectedPermission
                          : unselectedPermission,
                      });
                    });
                  }
                }}
              />
            </div>
          </div>
        </>
      )}
      <Tree isLoading={isLoading}>
        {filteredNodes.map((n, i) => {
          const isChecked = isNodeSelected(n);

          return (
            <Tree.Item
              key={n.internalId}
              type={n.expandable ? "node" : "leaf"}
              label={n.title}
              visual={getVisualForContentNode(n)}
              className="whitespace-nowrap"
              checkbox={
                n.preventSelection !== true &&
                canUpdatePermissions &&
                onPermissionUpdate
                  ? {
                      disabled: parentIsSelected,
                      checked: isChecked ? "checked" : "unchecked",
                      onChange: (checked) => {
                        setLocalStateByInternalId((prev) => ({
                          ...prev,
                          [n.internalId]: checked,
                        }));
                        onPermissionUpdate(n, {
                          newPermission: checked
                            ? selectedPermission
                            : unselectedPermission,
                        });
                      },
                    }
                  : undefined
              }
              actions={
                <div className="mr-8 flex flex-row gap-2">
                  {n.lastUpdatedAt ? (
                    <Tooltip
                      contentChildren={
                        <span>
                          {new Date(n.lastUpdatedAt).toLocaleString()}
                        </span>
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
                </div>
              }
              renderTreeItems={() => {
                const isParentNodeSelected = isNodeSelected(n);

                return renderChildItem(n, { isParentNodeSelected });
              }}
            />
          );
        })}
      </Tree>
    </>
  );
}

export function PermissionTree({
  owner,
  dataSource,
  permissionFilter,
  canUpdatePermissions,
  onPermissionUpdate,
  showExpand,
  isSearchEnabled,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  canUpdatePermissions?: boolean;
  onPermissionUpdate?: onPermissionUpdateType;
  showExpand?: boolean;
  isSearchEnabled: boolean;
}) {
  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );

  return (
    <>
      <ManagedDataSourceDocumentModal
        owner={owner}
        dataSource={dataSource}
        documentId={documentToDisplay}
        isOpen={!!documentToDisplay}
        setOpen={(open) => {
          if (!open) {
            setDocumentToDisplay(null);
          }
        }}
      />

      <div className="overflow-x-auto">
        <DataSourcePermissionTreeChildren
          owner={owner}
          dataSource={dataSource}
          parentId={null}
          permissionFilter={permissionFilter}
          canUpdatePermissions={canUpdatePermissions}
          onPermissionUpdate={onPermissionUpdate}
          showExpand={showExpand}
          parentIsSelected={false}
          displayDocumentSource={(documentId: string) => {
            setDocumentToDisplay(documentId);
          }}
          useConnectorPermissionsHook={useConnectorPermissions}
          isSearchEnabled={isSearchEnabled}
        />
      </div>
    </>
  );
}
