import {
  Checkbox,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
} from "@dust-tt/sparkle";
import {
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  FolderIcon,
} from "@heroicons/react/20/solid";
import { useState } from "react";

import {
  ConnectorPermission,
  ConnectorResourceType,
} from "@app/lib/connectors_api";
import { useConnectorPermissions } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

import { Spinner } from "./Spinner";

export type IconComponentType =
  | typeof DocumentTextIcon
  | typeof FolderIcon
  | typeof CircleStackIcon
  | typeof ChatBubbleLeftRightIcon;

function getIconForType(type: ConnectorResourceType): IconComponentType {
  switch (type) {
    case "file":
      return DocumentTextIcon;
    case "folder":
      return FolderIcon;
    case "database":
      return CircleStackIcon;
    case "channel":
      return ChatBubbleLeftRightIcon;
    default:
      ((n: never) => {
        throw new Error("Unreachable " + n);
      })(type);
  }
}

function PermissionTreeChildren({
  owner,
  dataSource,
  parentId,
  permissionFilter,
  canUpdatePermissions,
  onPermissionUpdate,
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
  showExpand?: boolean;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions(
      owner,
      dataSource,
      parentId,
      permissionFilter || null
    );

  const [localStateByInternalId, setLocalStateByInternalId] = useState<
    Record<string, boolean>
  >({});

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  return (
    <>
      {isResourcesLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-1">
          {resources.map((r) => {
            const IconComponent = getIconForType(r.type);
            const titlePrefix = r.type === "channel" ? "#" : "";
            return (
              <div key={r.internalId}>
                <div className="flex flex-row items-center py-1 text-sm">
                  {showExpand && (
                    <div className="mr-4">
                      {expanded[r.internalId] ? (
                        <ChevronDownIcon
                          className="h-5 w-5 cursor-pointer text-action-600"
                          onClick={() => {
                            setExpanded((prev) => ({
                              ...prev,
                              [r.internalId]: false,
                            }));
                          }}
                        />
                      ) : (
                        <ChevronRightIcon
                          className={classNames(
                            "h-5 w-5",
                            r.expandable
                              ? "cursor-pointer text-action-600"
                              : "cursor-not-allowed text-slate-300"
                          )}
                          onClick={() => {
                            if (r.expandable) {
                              setExpanded((prev) => ({
                                ...prev,
                                [r.internalId]: true,
                              }));
                            }
                          }}
                        />
                      )}
                    </div>
                  )}
                  <IconComponent className="h-5 w-5 text-slate-300" />
                  <span className="ml-2 text-sm font-medium text-element-900">{`${titlePrefix}${r.title}`}</span>
                  {canUpdatePermissions && onPermissionUpdate ? (
                    <div className="flex-grow">
                      <Checkbox
                        className="ml-auto"
                        checked={
                          localStateByInternalId[r.internalId] ??
                          ["read", "read_write"].includes(r.permission)
                        }
                        onChange={(checked) => {
                          setLocalStateByInternalId((prev) => ({
                            ...prev,
                            [r.internalId]: checked,
                          }));
                          onPermissionUpdate({
                            internalId: r.internalId,
                            permission: checked ? "read_write" : "write",
                          });
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                {expanded[r.internalId] && (
                  <div className="flex flex-row">
                    <div className="ml-4" />
                    <PermissionTreeChildren
                      owner={owner}
                      dataSource={dataSource}
                      parentId={r.internalId}
                      permissionFilter={permissionFilter}
                      canUpdatePermissions={canUpdatePermissions}
                      onPermissionUpdate={onPermissionUpdate}
                      showExpand={showExpand}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
      />
    </div>
  );
}
