import {
  Avatar,
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  Icon,
  LockIcon,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import type {
  ConnectorPermission,
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  LightWorkspaceType,
  UpdateConnectorRequestBody,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import * as React from "react";
import { useContext, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { setupConnection } from "@app/components/vaults/AddConnectionMenu";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDataSourceName } from "@app/lib/data_sources";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

import { PermissionTree } from "./ConnectorPermissionsTree";
import type { NotificationType } from "./sparkle/Notification";
import { SendNotificationsContext } from "./sparkle/Notification";

const PERMISSIONS_EDITABLE_CONNECTOR_TYPES: Set<ConnectorProvider> = new Set([
  "confluence",
  "slack",
  "google_drive",
  "microsoft",
  "intercom",
]);

interface DataSourceManagementModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

interface DataSourceEditionModalProps {
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  onEditPermissionsClick: () => void;
  owner: LightWorkspaceType;
}

export async function handleUpdatePermissions(
  connector: ConnectorType,
  dataSource: DataSourceType,
  owner: LightWorkspaceType,
  sendNotification: (notification: NotificationType) => void
) {
  const provider = connector.type;

  const connectionIdRes = await setupConnection({
    owner,
    provider,
  });
  if (connectionIdRes.isErr()) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions of the Data Source",
      description: connectionIdRes.error.message,
    });
    return;
  }

  const updateRes = await updateConnectorConnectionId(
    connectionIdRes.value,
    provider,
    dataSource,
    owner
  );
  if (updateRes.error) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions of the Data Source",
      description: updateRes.error,
    });
    return;
  }
}

async function updateConnectorConnectionId(
  newConnectionId: string,
  provider: string,
  dataSource: DataSourceType,
  owner: LightWorkspaceType
) {
  const res = await fetch(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: newConnectionId,
      } satisfies UpdateConnectorRequestBody),
    }
  );

  if (res.ok) {
    return { success: true, error: null };
  }

  const jsonErr = await res.json();
  const error = jsonErr.error;

  if (error.type === "connector_oauth_target_mismatch") {
    return {
      success: false,
      error: CONNECTOR_TYPE_TO_MISMATCH_ERROR[provider as ConnectorProvider],
    };
  }
  return {
    success: false,
    error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
  };
}

export function showAddDataModal(
  connectorProvider: ConnectorProvider
): boolean {
  switch (connectorProvider) {
    case "confluence":
    case "google_drive":
    case "microsoft":
    case "webcrawler":
    case "slack":
    case "intercom":
    case "snowflake":
      return true;
    case "notion":
    case "github":
      // TODO(GROUPS_INFRA): Revert back to `true` once the new connection management is released.
      return true;
    default:
      assertNever(connectorProvider);
  }
}

function DataSourceManagementModal({
  children,
  isOpen,
  onClose,
}: DataSourceManagementModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Connection"
      variant="side-sm"
      hasChanged={false}
    >
      <Page variant="modal">{children}</Page>
    </Modal>
  );
}

function DataSourceEditionModal({
  dataSource,
  isOpen,
  onClose,
  onEditPermissionsClick,
  owner,
}: DataSourceEditionModalProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { user } = useUser();

  const { connectorProvider, editedByUser } = dataSource;

  if (!connectorProvider || !user) {
    return null;
  }

  const isDataSourceOwner = editedByUser?.userId === user.sId;

  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connectorProvider];

  return (
    <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
      <>
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon visual={connectorConfiguration.logoComponent} size="md" />
            <Page.SectionHeader
              title={`${connectorConfiguration.name} data & permissions`}
            />
          </div>
          {isDataSourceOwner && (
            <div className="mb-4 mt-8 w-full rounded-lg bg-amber-50 p-3">
              <div className="flex items-center gap-2 font-medium text-amber-800">
                <Icon visual={InformationCircleIcon} />
                Important
              </div>
              <div className="p-4 text-sm text-amber-900">
                <b>Editing</b> can break the existing data structure in Dust and
                Assistants using them.
              </div>

              <div className="pl-4 text-sm text-amber-800">
                Read our{" "}
                <a
                  href="https://docs.dust.tt/docs/google-drive-connection"
                  className="text-blue-600"
                >
                  Playbook
                </a>
                .
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title="Connection Owner" />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" />
            <div>
              <span className="font-bold">
                {isDataSourceOwner ? "You" : editedByUser?.fullName}
              </span>{" "}
              set it up
              {editedByUser?.editedAt
                ? ` on ${formatTimestampToFriendlyDate(editedByUser?.editedAt)}`
                : "."}
            </div>
          </div>
          {!isDataSourceOwner && (
            <div className="flex items-center justify-center gap-2">
              <RequestDataSourceModal
                dataSources={[dataSource]}
                owner={owner}
              />
            </div>
          )}
        </div>
        {!isDataSourceOwner && (
          <div className="item flex flex-col gap-2 border-t pb-4 pt-4">
            <Page.SectionHeader title="Editing permissions" />
            <div className="mb-4 w-full rounded-lg border-pink-200 bg-pink-50 p-3">
              <div className="flex items-center gap-2 font-medium text-pink-900">
                <Icon visual={InformationCircleIcon} />
                Important
              </div>
              <div className="pl-4 pt-2 font-medium text-pink-900">
                You are not the owner of this connection.
              </div>
              <div className="p-4 text-sm text-amber-900">
                Editing permission rights with a different account will likely
                break the existing data structure in Dust and Assistants using
                them.
              </div>

              <div className="pl-4 text-sm text-amber-800">
                Read our{" "}
                <a
                  href="https://docs.dust.tt/docs/google-drive-connection"
                  className="text-blue-600"
                >
                  Playbook
                </a>
                .
              </div>
            </div>
            <div className="flex items-center justify-center">
              <Button
                label={"Edit Permissions"}
                icon={LockIcon}
                variant="primaryWarning"
                onClick={() => {
                  setShowConfirmDialog(true);
                }}
              />
            </div>
          </div>
        )}
        {isDataSourceOwner && (
          <div className="flex items-center justify-center">
            <Button
              label={"Edit Permissions"}
              icon={LockIcon}
              variant="primaryWarning"
              onClick={() => {
                setShowConfirmDialog(true);
              }}
            />
          </div>
        )}
        <Dialog
          title="Are you sure?"
          isOpen={showConfirmDialog}
          onCancel={() => setShowConfirmDialog(false)}
          onValidate={() => {
            void onEditPermissionsClick();
            setShowConfirmDialog(false);
          }}
          validateVariant="primaryWarning"
          cancelLabel="Cancel"
          validateLabel="Continue"
        >
          The changes you are about to make may break existing{" "}
          {connectorConfiguration.name} Data sources and the assistants using
          them. Are you sure you want to continue?
        </Dialog>
      </>
    </DataSourceManagementModal>
  );
}

interface ConnectorPermissionsModalProps {
  connector: ConnectorType;
  dataSource: DataSourceType;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  onManageButtonClick?: () => void;
  owner: WorkspaceType;
  readOnly: boolean;
}

export function ConnectorPermissionsModal({
  connector,
  dataSource,
  isAdmin,
  isOpen,
  onClose,
  onManageButtonClick,
  owner,
  readOnly,
}: ConnectorPermissionsModalProps) {
  const { mutate } = useSWRConfig();

  const [updatedPermissionByInternalId, setUpdatedPermissionByInternalId] =
    useState<Record<string, ConnectorPermission>>({});
  const [modalToShow, setModalToShow] = useState<
    "edition" | "selection" | null
  >(null);
  const { activeSubscription } = useWorkspaceActiveSubscription({
    workspaceId: owner.sId,
    disabled: !isAdmin,
  });
  const plan = activeSubscription ? activeSubscription.plan : null;

  const [saving, setSaving] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  const { user } = useUser();

  function closeModal(save: boolean) {
    setModalToShow(null);
    onClose(save);
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
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`,
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
              `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`
            )
        );

        closeModal(true);
      } else {
        closeModal(false);
      }
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

  useEffect(() => {
    if (isOpen) {
      if (showAddDataModal(connector.type)) {
        setModalToShow("selection");
      } else {
        setModalToShow("edition");
      }
    } else {
      setModalToShow(null);
    }
  }, [connector.type, isOpen]);

  if (!user) {
    return;
  }

  const OptionsComponent =
    CONNECTOR_CONFIGURATIONS[connector.type].optionsComponent;

  return (
    <>
      {onManageButtonClick && (
        <Button
          size="sm"
          label={`Manage ${getDataSourceName(dataSource)}`}
          icon={CloudArrowLeftRightIcon}
          variant="primary"
          disabled={readOnly || !isAdmin}
          onClick={() => {
            if (showAddDataModal(connector.type)) {
              setModalToShow("selection");
            } else {
              setModalToShow("edition");
            }
            onManageButtonClick();
          }}
        />
      )}
      <Modal
        title={`Manage ${getDataSourceName(dataSource)} connection`}
        isOpen={modalToShow === "selection"}
        onClose={() => closeModal(false)}
        onSave={save}
        saveLabel="Save"
        savingLabel="Saving..."
        isSaving={saving}
        hasChanged={!!Object.keys(updatedPermissionByInternalId).length}
        className="flex"
        variant="side-md"
      >
        <div className="mx-auto mt-4 flex w-full max-w-4xl grow flex-col gap-4">
          <div className="flex">
            <Button
              className="ml-auto justify-self-end"
              label="Edit permissions"
              variant="tertiary"
              icon={LockIcon}
              onClick={() => {
                setModalToShow("edition");
              }}
            />
          </div>
          {OptionsComponent && plan && (
            <>
              <div className="p-1 text-xl font-bold">Connector options</div>

              <div className="p-1">
                <div className="border-y">
                  <OptionsComponent
                    {...{ owner, readOnly, isAdmin, dataSource, plan }}
                  />
                </div>
              </div>
            </>
          )}

          <div className="p-1 text-xl font-bold">
            {CONNECTOR_CONFIGURATIONS[connector.type].selectLabel}
          </div>

          <PermissionTree
            isSearchEnabled={
              CONNECTOR_CONFIGURATIONS[connector.type].isSearchEnabled
            }
            isRoundedBackground={true}
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
      </Modal>
      <DataSourceEditionModal
        isOpen={modalToShow === "edition"}
        onClose={() => closeModal(false)}
        dataSource={dataSource}
        owner={owner}
        onEditPermissionsClick={() => {
          void handleUpdatePermissions(
            connector,
            dataSource,
            owner,
            sendNotification
          );
        }}
      />
    </>
  );
}
