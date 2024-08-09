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
  ConnectorProvider,
  ConnectorType,
  DataSourceIntegration,
  DataSourceType,
  EditedByUser,
  UpdateConnectorRequestBody,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import type { NextRouter } from "next/router";
import React, { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PostManagedDataSourceRequestBody } from "@app/pages/api/w/[wId]/data_sources/managed";
import { setupConnection } from "@app/pages/w/[wId]/builder/data-sources/managed";

interface DataSourceEditionModalProps {
  isOpen: boolean;
  owner: WorkspaceType;
  connectorProvider: ConnectorProvider | null | undefined;
  dataSourceIntegration: DataSourceIntegration | DataSourceType | null;
  onClose: () => void;
  router: NextRouter;
  dustClientFacingUrl: string;
  user: UserType;
  setIsRequestDataSourceModalOpen?: (show: boolean) => void;
  setDataSourceIntegrations?: (
    integrations: (prev: DataSourceIntegration[]) => DataSourceIntegration[]
  ) => void;
  setIsLoadingByProvider?: (
    providers: (
      prev: Record<ConnectorProvider, boolean | undefined>
    ) => Record<ConnectorProvider, boolean | undefined>
  ) => void;
}

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
];

function isDataSourceIntegration(
  integration: DataSourceIntegration | DataSourceType | null
): integration is DataSourceIntegration {
  return (
    integration !== null &&
    "id" in integration &&
    "name" in integration &&
    "type" in integration &&
    "config" in integration
  );
}

export function DataSourceEditionModal({
  isOpen,
  owner,
  connectorProvider,
  dataSourceIntegration,
  onClose,
  router,
  dustClientFacingUrl,
  user,
  setIsRequestDataSourceModalOpen,
  setDataSourceIntegrations,
  setIsLoadingByProvider,
}: DataSourceEditionModalProps) {
  const sendNotification = useContext(SendNotificationsContext);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!connectorProvider || !dataSourceIntegration) {
    return;
  }

  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connectorProvider];

  let isSetup: boolean | null = null;
  let dataSourceName: string | null = null;
  if (isDataSourceIntegration(dataSourceIntegration)) {
    isSetup = !!dataSourceIntegration?.connector;
    dataSourceName = dataSourceIntegration.dataSourceName;
  } else {
    isSetup = true;
    dataSourceName = dataSourceIntegration.name;
  }

  let dataSourceOwner: EditedByUser | null | undefined = null;
  let isDataSourceOwner: boolean = false;
  if (isSetup) {
    dataSourceOwner = dataSourceIntegration.editedByUser;
    isDataSourceOwner =
      dataSourceIntegration?.editedByUser?.userId === user.sId;
  }

  const handleEnableManagedDataSource = async (
    dataSourceIntegration: DataSourceIntegration
  ) => {
    if (!setIsLoadingByProvider || !setDataSourceIntegrations) {
      return;
    }
    try {
      const provider = dataSourceIntegration.connectorProvider;
      const suffix = dataSourceIntegration.setupWithSuffix;
      const connectionIdRes = await setupConnection({
        dustClientFacingUrl,
        owner,
        provider,
      });
      if (connectionIdRes.isErr()) {
        throw connectionIdRes.error;
      }
      onClose();
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: true }));

      const res = await fetch(
        suffix
          ? `/api/w/${
              owner.sId
            }/data_sources/managed?suffix=${encodeURIComponent(suffix)}`
          : `/api/w/${owner.sId}/data_sources/managed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider,
            connectionId: connectionIdRes.value,
            name: undefined,
            configuration: null,
          } satisfies PostManagedDataSourceRequestBody),
        }
      );

      if (res.ok) {
        const createdManagedDataSource: {
          dataSource: DataSourceType;
          connector: ConnectorType;
        } = await res.json();
        setDataSourceIntegrations((prev) =>
          prev.map((ds) => {
            return ds.connector === null && ds.connectorProvider == provider
              ? {
                  ...ds,
                  connector: createdManagedDataSource.connector,
                  setupWithSuffix: null,
                  dataSourceName: createdManagedDataSource.dataSource.name,
                }
              : ds;
          })
        );
        if (REDIRECT_TO_EDIT_PERMISSIONS.includes(provider)) {
          void router.push(
            `/w/${owner.sId}/builder/data-sources/${createdManagedDataSource.dataSource.name}?edit_permissions=true`
          );
        }
      } else {
        const responseText = await res.text();
        sendNotification({
          type: "error",
          title: `Failed to enable connection (${provider})`,
          description: `Got: ${responseText}`,
        });
      }
    } catch (e) {
      onClose();
      sendNotification({
        type: "error",
        title: `Failed to enable connection (${dataSourceIntegration.connectorProvider})`,
      });
    } finally {
      setIsLoadingByProvider((prev) => ({
        ...prev,
        [dataSourceIntegration.connectorProvider]: false,
      }));
    }
  };

  const updateConnectorConnectionId = async (
    newConnectionId: string,
    provider: string
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSourceName}/managed/update`,
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
  };

  const handleUpdatePermissions = async () => {
    if (!dataSourceIntegration) {
      return;
    }

    const connectionIdRes = await setupConnection({
      dustClientFacingUrl,
      owner,
      provider: connectorProvider,
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
      connectorProvider
    );
    if (updateRes.error) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: updateRes.error,
      });
    }
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Connection"
      variant="side-sm"
      hasChanged={false}
    >
      <Page variant="modal">
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon visual={connectorConfiguration.logoComponent} size="md" />
            <Page.SectionHeader
              title={
                isSetup
                  ? `${connectorConfiguration.name} data & permissions`
                  : `Connecting ${connectorConfiguration.name}`
              }
            />
          </div>
          {(!isSetup || isDataSourceOwner) && (
            <div className="mb-4 mt-8 w-full rounded-lg bg-amber-50 p-3">
              <div className="flex items-center gap-2 font-medium text-amber-800">
                <Icon visual={InformationCircleIcon} />
                Important
              </div>
              {isSetup ? (
                <div className="p-4 text-sm text-amber-900">
                  <b>Editing</b> can break the existing data structure in Dust
                  and Assistants using them.
                </div>
              ) : (
                <div className="p-4 text-sm text-amber-900">
                  <div className="pb-2 font-medium">
                    Only one person can manage the connection.
                  </div>
                  Select a team member with {connectorConfiguration.name} admin
                  rights and access to relevant data to handle the connection
                  and data synchronization.
                </div>
              )}

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

          <div className="mt-4 flex items-center justify-center">
            {!isSetup && (
              <Button
                variant="primary"
                size="md"
                icon={CloudArrowLeftRightIcon}
                label="Make Connection"
                onClick={async () => {
                  await handleEnableManagedDataSource(
                    dataSourceIntegration as DataSourceIntegration
                  );
                }}
              />
            )}
          </div>
        </div>
        {isSetup && (
          <div className="flex flex-col gap-2 border-t pb-4 pt-4">
            <Page.SectionHeader title="Connection Owner" />
            <div className="flex items-center gap-2">
              <Avatar visual={dataSourceOwner?.imageUrl} size="sm" />
              <div>
                <span className="font-bold">
                  {isDataSourceOwner
                    ? "You"
                    : dataSourceIntegration?.editedByUser?.fullName}
                </span>{" "}
                set it up
                {dataSourceIntegration?.editedByUser?.editedAt
                  ? ` on ${formatTimestampToFriendlyDate(dataSourceIntegration?.editedByUser?.editedAt)}`
                  : "."}
              </div>
            </div>
            {isSetup && !isDataSourceOwner && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  label={`Request from ${dataSourceOwner?.fullName ?? ""}`}
                  onClick={() => {
                    if (setIsRequestDataSourceModalOpen) {
                      setIsRequestDataSourceModalOpen(true);
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}
        {isSetup && !isDataSourceOwner && (
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
        <Dialog
          title="Are you sure?"
          isOpen={showConfirmDialog}
          onCancel={() => setShowConfirmDialog(false)}
          onValidate={() => {
            void handleUpdatePermissions();
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
      </Page>
    </Modal>
  );
}
