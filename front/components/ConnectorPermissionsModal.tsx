import { Checkbox, Modal } from "@dust-tt/sparkle";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { mutate } from "swr";

import {
  ConnectorPermission,
  ConnectorProvider,
  ConnectorType,
} from "@app/lib/connectors_api";
import { useConnectorDefaultNewResourcePermission } from "@app/lib/swr";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

import { PermissionTree } from "./ConnectorPermissionsTree";

const CONNECTOR_TYPE_TO_RESOURCE_NAME: Record<ConnectorProvider, string> = {
  notion: "top-level Notion pages or databases",
  google_drive: "Google Drive folders",
  slack: "Slack channels",
  github: "GitHub repositories",
};

const CONNECTOR_TYPE_TO_RESOURCE_LIST_TITLE_TEXT: Record<
  ConnectorProvider,
  string | null
> = {
  slack:
    "Dust is currently invited to the channels below. Select if data from those channels should be synchronized or not.",
  notion: null,
  google_drive: null,
  github: null,
};

const CONNECTOR_TYPE_TO_DEFAULT_PERMISSION_TITLE_TEXT: Record<
  ConnectorProvider,
  string | null
> = {
  slack: "Automatically synchronize data from channels Dust is invited to:",
  notion: null,
  google_drive: null,
  github: null,
};

const PERMISSIONS_EDITABLE_CONNECTOR_TYPES: Set<ConnectorProvider> = new Set([
  "slack",
  "google_drive",
]);
export const CONNECTOR_TYPE_TO_SHOW_EXPAND: Record<ConnectorProvider, boolean> =
  {
    notion: true,
    slack: false,
    github: false,
    google_drive: true,
  };

export default function ConnectorPermissionsModal({
  owner,
  connector,
  dataSource,
  isOpen,
  setOpen,
  onEditPermission,
}: {
  owner: WorkspaceType;
  connector: ConnectorType;
  dataSource: DataSourceType;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  onEditPermission: () => void;
}) {
  const [updatedPermissionByInternalId, setUpdatedPermissionByInternalId] =
    useState<Record<string, ConnectorPermission>>({});

  const {
    defaultNewResourcePermission,
    isDefaultNewResourcePermissionLoading,
    isDefaultNewResourcePermissionError,
  } = useConnectorDefaultNewResourcePermission(owner, dataSource);

  const [
    automaticallyIncludeNewResources,
    setAutomaticallyIncludeNewResources,
  ] = useState<null | boolean>(null);

  function closeModal() {
    setOpen(false);
    setTimeout(() => {
      setUpdatedPermissionByInternalId({});
      setAutomaticallyIncludeNewResources(null);
    }, 300);
  }

  const canUpdatePermissions = PERMISSIONS_EDITABLE_CONNECTOR_TYPES.has(
    connector.type
  );

  const resourceListTitleText =
    CONNECTOR_TYPE_TO_RESOURCE_LIST_TITLE_TEXT[connector.type] ??
    `Dust has access to the following ${
      CONNECTOR_TYPE_TO_RESOURCE_NAME[connector.type]
    }:`;

  const defaultPermissionTitleText =
    CONNECTOR_TYPE_TO_DEFAULT_PERMISSION_TITLE_TEXT[connector.type];

  async function save() {
    try {
      if (Object.keys(updatedPermissionByInternalId).length) {
        const r = await fetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resources: Object.keys(updatedPermissionByInternalId).map(
                (internalId) => ({
                  internal_id: internalId,
                  permission: updatedPermissionByInternalId[internalId],
                })
              ),
            }),
          }
        );

        if (!r.ok) {
          window.alert("An unexpected error occurred");
        }

        await mutate(
          `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions`
        );
      }

      if (automaticallyIncludeNewResources !== null) {
        const newPermission = automaticallyIncludeNewResources
          ? "read_write"
          : "write";

        if (newPermission !== defaultNewResourcePermission) {
          const r = await fetch(
            `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/update`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                defaultNewResourcePermission: newPermission,
              }),
            }
          );

          if (!r.ok) {
            window.alert("An unexpected error occurred");
          }

          await mutate(
            `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions/default`
          );
        }
      }
    } catch (e) {
      console.error(e);
      window.alert("An unexpected error occurred");
    }

    closeModal();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      onSave={save}
      hasChanged={
        !!Object.keys(updatedPermissionByInternalId).length ||
        automaticallyIncludeNewResources !== null
      }
      action={{
        onClick: onEditPermission,
        labelVisible: true,
        label: "Re-authorize",
        variant: "tertiary",
        size: "xs",
        icon: Cog6ToothIcon,
      }}
    >
      <div className="text-left">
        {!isDefaultNewResourcePermissionLoading &&
        defaultNewResourcePermission ? (
          <>
            {canUpdatePermissions && defaultPermissionTitleText ? (
              <div className="ml-2 mt-8 flex flex-row">
                <span className="text-sm text-gray-500">
                  {defaultPermissionTitleText}
                </span>
                <div className="flex-grow">
                  <Checkbox
                    className="ml-auto"
                    onChange={(checked) => {
                      setAutomaticallyIncludeNewResources(checked);
                    }}
                    checked={
                      automaticallyIncludeNewResources ??
                      ["read", "read_write"].includes(
                        defaultNewResourcePermission
                      )
                    }
                  />
                </div>
              </div>
            ) : null}
            <div>
              <div className="ml-2 mt-16">
                <div className="text-sm text-gray-500">
                  {resourceListTitleText}
                </div>
              </div>
            </div>
            <div className="mb-16 ml-2 mt-8">
              <PermissionTree
                owner={owner}
                dataSource={dataSource}
                canUpdatePermissions={canUpdatePermissions}
                onPermissionUpdate={({ internalId, permission }) => {
                  setUpdatedPermissionByInternalId((prev) => ({
                    ...prev,
                    [internalId]: permission,
                  }));
                }}
                showExpand={CONNECTOR_TYPE_TO_SHOW_EXPAND[connector.type]}
              />
            </div>
          </>
        ) : null}
        {isDefaultNewResourcePermissionError && (
          <div className="text-red-300">An unexpected error occurred</div>
        )}
      </div>
    </Modal>
  );
}
