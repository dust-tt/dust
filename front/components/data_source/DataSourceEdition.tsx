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
  EditedByUser,
  UpdateConnectorRequestBody,
  UserType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import { CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import type { NextRouter } from "next/router";
import React, { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { setupConnection } from "@app/pages/w/[wId]/builder/data-sources/managed";

export type DataSourceIntegration = {
  name: string;
  dataSourceName: string | null;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage?: string | null;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag: WhitelistableFeature | null;
  connectorProvider: ConnectorProvider;
  description: string;
  limitations: string | null;
  guideLink: string | null;
  synchronizedAgo: string | null;
  setupWithSuffix: string | null;
  usage: number | null;
  editedByUser?: EditedByUser | null;
};

interface DataSourceEditionModalProps {
  isOpen: boolean;
  owner: WorkspaceType;
  connectorProvider: ConnectorProvider;
  dataSourceIntegration?: DataSourceIntegration;
  onClose: () => void;
  router: NextRouter;
  dustClientFacingUrl: string;
  user: UserType;
  setIsRequestDataSourceModalOpen: (show: boolean) => void;
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
}: DataSourceEditionModalProps) {
  const sendNotification = useContext(SendNotificationsContext);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connectorProvider];
  const isSetup = !!dataSourceIntegration;

  let dataSourceOwner: EditedByUser | null | undefined = null;
  let isDataSourceOwner: boolean = false;
  if (isSetup) {
    dataSourceOwner = dataSourceIntegration.editedByUser;
    isDataSourceOwner =
      dataSourceIntegration?.editedByUser?.userId === user.sId;
  }

  const updateConnectorConnectionId = async (
    newConnectionId: string,
    provider: string
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSourceIntegration?.dataSourceName}/managed/update`,
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
            {isSetup ? (
              isDataSourceOwner ? (
                <Button
                  label="Edit Connection"
                  onClick={() =>
                    void router.push(
                      `/w/${owner.sId}/builder/data-sources/${dataSourceIntegration.dataSourceName}`
                    )
                  }
                />
              ) : (
                <></>
              )
            ) : (
              <Button
                variant="primary"
                size="md"
                icon={CloudArrowLeftRightIcon}
                label="Make Connection"
              />
            )}
          </div>
        </div>
        {isSetup && (
          <div className="flex flex-col gap-2 border-t pb-4 pt-4">
            <Page.SectionHeader title="Connection Owner" />
            <div className="flex items-center gap-2">
              <Avatar
                visual="https://dust.tt/static/droidavatar/Droid_Black_2.jpg"
                size="sm"
              />
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
                  onClick={() => setIsRequestDataSourceModalOpen(true)}
                />
              </div>
            )}
          </div>
        )}
        {isSetup && !isDataSourceOwner && (
          <div className="item flex flex-col gap-2 border-t pb-4 pt-4">
            <Page.SectionHeader title="Editing data & permissions" />
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
                label={"Edit Data & Permission"}
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
