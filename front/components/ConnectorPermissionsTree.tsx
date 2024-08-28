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
  ConnectorProvider,
  ContentNode,
  DataSourceType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import type { ConnectorPermission } from "@dust-tt/types";
import { useState } from "react";

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

interface PermissionTreeChildrenBaseProps {
  canUpdatePermissions?: boolean;
  displayDocumentSource: (documentId: string) => void;
  onPermissionUpdate?: ({
    internalId,
    permission,
  }: {
    internalId: string;
    permission: ConnectorPermission;
  }) => void;
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

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  return (
    <PermissionTreeChildren
      dataSource={dataSource}
      isLoading={isResourcesLoading}
      nodes={resources}
      owner={owner}
      parentId={parentId}
      renderChildItem={(node: ContentNode, { isParentNodeSelected }) => (
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
    <PermissionTreeChildren
      dataSource={dataSource}
      isLoading={isNodesLoading}
      nodes={nodes}
      owner={owner}
      parentId={parentId}
      renderChildItem={(node: ContentNode, { isParentNodeSelected }) => (
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
  );
}

type PermissionTreeChildrenProps = PermissionTreeChildrenBaseProps & {
  dataSource: DataSourceType;
  isLoading: boolean;
  nodes: ContentNode[];
  renderChildItem: (
    r: ContentNode,
    { isParentNodeSelected }: { isParentNodeSelected: boolean }
  ) => React.ReactNode;
};

function PermissionTreeChildren({
  canUpdatePermissions,
  dataSource,
  displayDocumentSource,
  isLoading,
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

  const resourcesFiltered = nodes.filter(
    (r) => search.trim().length === 0 || r.title.includes(search)
  );

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
                    resourcesFiltered.forEach((r) => {
                      newState[r.internalId] = !selectAllClicked;
                    });
                    return newState;
                  });
                  if (onPermissionUpdate) {
                    resourcesFiltered.forEach((r) => {
                      onPermissionUpdate({
                        internalId: r.internalId,
                        permission: !selectAllClicked
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
        {resourcesFiltered.map((r, i) => {
          const isChecked =
            parentIsSelected ||
            (localStateByInternalId[r.internalId] ??
              ["read", "read_write"].includes(r.permission));

          return (
            <Tree.Item
              key={r.internalId}
              type={r.expandable ? "node" : "leaf"}
              label={r.title}
              visual={getVisualForContentNode(r)}
              className="whitespace-nowrap"
              checkbox={
                r.preventSelection !== true &&
                canUpdatePermissions &&
                onPermissionUpdate
                  ? {
                      disabled: parentIsSelected,
                      checked: isChecked ? "checked" : "unchecked",
                      onChange: (checked) => {
                        setLocalStateByInternalId((prev) => ({
                          ...prev,
                          [r.internalId]: checked,
                        }));
                        onPermissionUpdate({
                          internalId: r.internalId,
                          permission: checked
                            ? selectedPermission
                            : unselectedPermission,
                        });
                      },
                    }
                  : undefined
              }
              actions={
                <div className="mr-8 flex flex-row gap-2">
                  {r.lastUpdatedAt ? (
                    <Tooltip
                      contentChildren={
                        <span>
                          {new Date(r.lastUpdatedAt).toLocaleString()}
                        </span>
                      }
                      position={i === 0 ? "below" : "above"}
                    >
                      <span className="text-xs text-gray-500">
                        {timeAgoFrom(r.lastUpdatedAt)} ago
                      </span>
                    </Tooltip>
                  ) : null}
                  <IconButton
                    size="xs"
                    icon={ExternalLinkIcon}
                    onClick={() => {
                      if (r.sourceUrl) {
                        window.open(r.sourceUrl, "_blank");
                      }
                    }}
                    className={classNames(
                      r.sourceUrl ? "" : "pointer-events-none opacity-0"
                    )}
                    disabled={!r.sourceUrl}
                    variant="tertiary"
                  />
                  <IconButton
                    size="xs"
                    icon={BracesIcon}
                    onClick={() => {
                      if (r.dustDocumentId) {
                        displayDocumentSource(r.dustDocumentId);
                      }
                    }}
                    className={classNames(
                      r.dustDocumentId ? "" : "pointer-events-none opacity-0"
                    )}
                    disabled={!r.dustDocumentId}
                    variant="tertiary"
                  />
                </div>
              }
              renderTreeItems={() => {
                const isParentNodeSelected =
                  (parentIsSelected || localStateByInternalId[r.internalId]) ??
                  ["read", "read_write"].includes(r.permission);

                return renderChildItem(r, { isParentNodeSelected });
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
  onPermissionUpdate?: ({
    internalId,
    permission,
  }: {
    internalId: string;
    permission: ConnectorPermission;
  }) => void;
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
