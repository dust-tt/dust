import { Modal, Page } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import type { ConnectorPermission, ConnectorType } from "@dust-tt/types";
import { useContext, useState } from "react";
import { useSWRConfig } from "swr";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

import { PermissionTree } from "./ConnectorPermissionsTree";
import { SendNotificationsContext } from "./sparkle/Notification";

const PERMISSIONS_EDITABLE_CONNECTOR_TYPES: Set<ConnectorProvider> = new Set([
  "confluence",
  "slack",
  "google_drive",
  "microsoft",
  "intercom",
]);

export function ConnectorPermissionsModal({
  owner,
  connector,
  dataSource,
  isOpen,
  onClose,
}: {
  owner: WorkspaceType;
  connector: ConnectorType;
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { mutate } = useSWRConfig();

  const [updatedPermissionByInternalId, setUpdatedPermissionByInternalId] =
    useState<Record<string, ConnectorPermission>>({});

  const [saving, setSaving] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  function closeModal() {
    onClose();
    setTimeout(() => {
      setUpdatedPermissionByInternalId({});
    }, 300);
  }

  const canUpdatePermissions = PERMISSIONS_EDITABLE_CONNECTOR_TYPES.has(
    connector.type
  );

  async function save() {
    setSaving(true);
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
          const error: { error: { message: string } } = await r.json();
          window.alert(error.error.message);
        }

        await mutate(
          (key) =>
            typeof key === "string" &&
            key.startsWith(
              `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions`
            )
        );
      }

      closeModal();
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error saving permissions",
        description: "An unexpected error occurred while saving permissions.",
      });
      console.error(e);
    }
    setSaving(false);
  }

  return (
    <Modal
      title="Add / Remove data"
      isOpen={isOpen}
      onClose={closeModal}
      onSave={save}
      saveLabel="Save"
      savingLabel="Saving..."
      isSaving={saving}
      hasChanged={!!Object.keys(updatedPermissionByInternalId).length}
      variant="full-screen"
    >
      <div className="mx-auto max-w-4xl text-left">
        <div className="flex flex-col pt-12">
          <Page.Vertical align="stretch" gap="xl">
            <Page.Header
              title="Make available to the workspace"
              description={`Selected resources will be accessible to all members of the workspace.`}
            />
            <div className="mx-2 mb-16 w-full">
              <PermissionTree
                isSearchEnabled={
                  CONNECTOR_CONFIGURATIONS[connector.type].isSearchEnabled
                }
                owner={owner}
                dataSource={dataSource}
                canUpdatePermissions={canUpdatePermissions}
                onPermissionUpdate={(node, { newPermission }) => {
                  const { internalId } = node;

                  setUpdatedPermissionByInternalId((prev) => ({
                    ...prev,
                    [internalId]: newPermission,
                  }));
                }}
                showExpand={CONNECTOR_CONFIGURATIONS[connector.type]?.isNested}
              />
            </div>
          </Page.Vertical>
        </div>
      </div>
    </Modal>
  );
}
