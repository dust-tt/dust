import { Button, LockIcon, Modal, Page } from "@dust-tt/sparkle";
import type {
  ConnectorPermission,
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { useContext, useState } from "react";
import * as React from "react";
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

interface ConnectorUiConfig {
  displayEditionModal: boolean;
  addDataWithConnection: boolean;
}

export function getRenderingConfigForConnectorProvider(
  connectorProvider: ConnectorProvider
): ConnectorUiConfig {
  switch (connectorProvider) {
    case "confluence":
    case "google_drive":
    case "microsoft":
      return {
        addDataWithConnection: false,
        displayEditionModal: true,
      };
    case "webcrawler":
    case "slack":
    case "intercom":
      return {
        addDataWithConnection: false,
        displayEditionModal: false,
      };
    case "notion":
    case "github":
      return {
        addDataWithConnection: true,
        displayEditionModal: true,
      };
    default:
      assertNever(connectorProvider);
  }
}

export function ConnectorPermissionsModal({
  owner,
  connector,
  dataSource,
  isOpen,
  onClose,
  setShowEditionModal,
  handleUpdatePermissions,
}: {
  owner: WorkspaceType;
  connector: ConnectorType;
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  setShowEditionModal: (show: boolean) => void;
  handleUpdatePermissions: (
    connector: ConnectorType,
    dataSource: DataSourceType
  ) => Promise<void>;
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

  const { displayEditionModal } =
    getRenderingConfigForConnectorProvider(connector.type);

  return (
    <Modal
      title="Selected data sources"
      isOpen={isOpen}
      onClose={closeModal}
      onSave={save}
      saveLabel="Save"
      savingLabel="Saving..."
      isSaving={saving}
      hasChanged={!!Object.keys(updatedPermissionByInternalId).length}
      variant="side-md"
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex pr-4 pt-4">
          <Button
            className="ml-auto justify-self-end"
            label="Edit permissions"
            variant="tertiary"
            icon={LockIcon}
            onClick={() => {
              if (displayEditionModal) {
                setShowEditionModal(true);
                onClose();
              } else {
                void handleUpdatePermissions(connector, dataSource);
              }
            }}
          />
        </div>
        <div className="flex flex-col pt-4">
          <Page.Vertical align="stretch" gap="xl">
            <Page.Header title="Make available to the workspace:" />
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
                // List only document-type items when displaying permissions for a data source.
                viewType="documents"
              />
            </div>
          </Page.Vertical>
        </div>
      </div>
    </Modal>
  );
}
