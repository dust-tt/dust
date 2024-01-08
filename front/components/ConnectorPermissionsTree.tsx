import {
  BracesIcon,
  ExternalLinkIcon,
  IconButton,
  Tooltip,
  Tree,
} from "@dust-tt/sparkle";
import {
  ConnectorProvider,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { ConnectorPermission } from "@dust-tt/types";
import { useState } from "react";

import ManagedDataSourceDocumentModal from "@app/components/ManagedDataSourceDocumentModal";
import { useConnectorPermissions } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";

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
  intercom: undefined,
  webcrawler: undefined,
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
  showDocumentModal,
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
  showDocumentModal: (documentId: string) => void;
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
      {resources.map((r, i) => {
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
            label={r.title}
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
            actions={
              <div className="mr-8 flex flex-row gap-2">
                {r.lastUpdatedAt ? (
                  <Tooltip
                    contentChildren={
                      <span>{new Date(r.lastUpdatedAt).toLocaleString()}</span>
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
                />
                <IconButton
                  size="xs"
                  icon={BracesIcon}
                  onClick={() => {
                    if (r.dustDocumentId) {
                      showDocumentModal(r.dustDocumentId);
                    }
                  }}
                  className={classNames(
                    r.dustDocumentId ? "" : "pointer-events-none opacity-0"
                  )}
                  disabled={!r.dustDocumentId}
                />
              </div>
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
                showDocumentModal={showDocumentModal}
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
        <PermissionTreeChildren
          owner={owner}
          dataSource={dataSource}
          parentId={null}
          permissionFilter={permissionFilter}
          canUpdatePermissions={canUpdatePermissions}
          onPermissionUpdate={onPermissionUpdate}
          showExpand={showExpand}
          parentIsSelected={false}
          showDocumentModal={(documentId: string) => {
            setDocumentToDisplay(documentId);
          }}
        />
      </div>
    </>
  );
}
