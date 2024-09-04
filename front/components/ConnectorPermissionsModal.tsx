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
  displayAddDataButton: boolean;
  displayEditionModal: boolean;
  displayManageConnectionButton: boolean;
  addDataWithConnection: boolean;
  displayWebcrawlerSettingsButton: boolean;
  guideLink: string | null;
  postPermissionsUpdateMessage?: string;
}

function getRenderingConfigForConnectorProvider(
  connectorProvider: ConnectorProvider
): ConnectorUiConfig {
  const commonConfig = {
    addDataWithConnection: false,
    displayAddDataButton: true,
    displayManageConnectionButton: true,
    displayWebcrawlerSettingsButton: false,
  };

  switch (connectorProvider) {
    case "confluence":
    case "google_drive":
    case "microsoft":
      return {
        ...commonConfig,
        displayEditionModal: true,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };

    case "slack":
    case "intercom":
      return {
        ...commonConfig,
        displayEditionModal: false,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };
    case "notion":
      return {
        ...commonConfig,
        addDataWithConnection: true,
        displayEditionModal: true,
        displayManageConnectionButton: false,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
        postPermissionsUpdateMessage:
          "We've taken your edits into account. Notion permission edits may take up to 24 hours to be reflected on your workspace.",
      };
    case "github":
      return {
        ...commonConfig,
        addDataWithConnection: true,
        displayEditionModal: true,
        displayManageConnectionButton: false,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
      };
    case "webcrawler":
      return {
        addDataWithConnection: false,
        displayAddDataButton: false,
        displayEditionModal: false,
        displayManageConnectionButton: false,
        displayWebcrawlerSettingsButton: true,
        guideLink: CONNECTOR_CONFIGURATIONS[connectorProvider].guideLink,
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

  const { displayEditionModal, displayManageConnectionButton } =
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
        {displayManageConnectionButton && (
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
        )}
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
