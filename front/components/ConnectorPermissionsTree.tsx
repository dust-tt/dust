import { Tree } from "@dust-tt/sparkle";
import { useState } from "react";

import {
  ConnectorPermission,
  ConnectorProvider,
} from "@app/lib/connectors_api";
import { useConnectorPermissions } from "@app/lib/swr";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

const CONNECTOR_TYPE_TO_PERMISSIONS: Record<
  ConnectorProvider,
  { selected: ConnectorPermission; unselected: ConnectorPermission } | undefined
> = {
  slack: {
    selected: "read_write",
    unselected: "write",
  },
  google_drive: {
    selected: "read",
    unselected: "none",
  },
  notion: undefined,
  github: undefined,
};

function PermissionTreeChildren({
  owner,
  dataSource,
  parentId,
  permissionFilter,
  canUpdatePermissions,
  onPermissionUpdate,
  parentIsSelected,
  showExpand,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  permissionFilter?: ConnectorPermission;
  canUpdatePermissions?: boolean;
  onPermissionUpdate?: ({
    internalId,
    permission,
  }: {
    internalId: string;
    permission: ConnectorPermission;
  }) => void;
  parentIsSelected?: boolean;
  showExpand?: boolean;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      owner,
      dataSource,
      parentId,
      filterPermission: permissionFilter || null,
    });
  const [localStateByInternalId, setLocalStateByInternalId] = useState<
    Record<string, boolean>
  >({});

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selectedPermission: ConnectorPermission =
    (dataSource.connectorProvider &&
      CONNECTOR_TYPE_TO_PERMISSIONS[dataSource.connectorProvider]?.selected) ||
    "none";
  const unselectedPermission: ConnectorPermission =
    (dataSource.connectorProvider &&
      CONNECTOR_TYPE_TO_PERMISSIONS[dataSource.connectorProvider]
        ?.unselected) ||
    "none";

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  return (
    <Tree isLoading={isResourcesLoading}>
      {resources.map((r) => {
        const titlePrefix = r.type === "channel" ? "#" : "";
        return (
          <Tree.Item
            key={r.internalId}
            collapsed={!expanded[r.internalId]}
            onChevronClick={() => {
              setExpanded((prev) => ({
                ...prev,
                [r.internalId]: prev[r.internalId] ? false : true,
              }));
            }}
            type={r.expandable ? "node" : "leaf"}
            label={`${titlePrefix}${r.title}`}
            variant={r.type}
            className="whitespace-nowrap"
            checkbox={
              canUpdatePermissions && onPermissionUpdate
                ? {
                    disabled: parentIsSelected,
                    checked:
                      parentIsSelected ||
                      (localStateByInternalId[r.internalId] ??
                        ["read", "read_write"].includes(r.permission)),
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
          >
            {expanded[r.internalId] && (
              <PermissionTreeChildren
                owner={owner}
                dataSource={dataSource}
                parentId={r.internalId}
                permissionFilter={permissionFilter}
                canUpdatePermissions={canUpdatePermissions}
                onPermissionUpdate={onPermissionUpdate}
                showExpand={showExpand}
                parentIsSelected={
                  (parentIsSelected || localStateByInternalId[r.internalId]) ??
                  ["read", "read_write"].includes(r.permission)
                }
              />
            )}
          </Tree.Item>
        );
      })}
    </Tree>
  );
}

export function PermissionTree({
  owner,
  dataSource,
  permissionFilter,
  canUpdatePermissions,
  onPermissionUpdate,
  showExpand,
}: {
  owner: WorkspaceType;
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
}) {
  return (
    <div className="overflow-x-auto">
      <PermissionTreeChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
        permissionFilter={permissionFilter}
        canUpdatePermissions={canUpdatePermissions}
        onPermissionUpdate={onPermissionUpdate}
        showExpand={showExpand}
        parentIsSelected={false}
      />
    </div>
  );
}
