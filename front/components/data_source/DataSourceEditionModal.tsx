import {
  Avatar,
  Button,
  Dialog,
  Icon,
  LockIcon,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  LightWorkspaceType,
  UserType,
} from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import React, { useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface DataSourceManagementModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
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

interface DataSourceEditionModalProps {
  dataSource: DataSourceType;
  dustClientFacingUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onEditPermissionsClick: () => void;
  onRequestFromDataSourceClick: () => void;
  owner: LightWorkspaceType;
  user: UserType;
}

export function DataSourceEditionModal({
  dataSource,
  isOpen,
  onClose,
  onEditPermissionsClick,
  onRequestFromDataSourceClick,
  user,
}: DataSourceEditionModalProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { connectorProvider, editedByUser } = dataSource;

  const dataSourceOwner = editedByUser ?? null;
  const isDataSourceOwner = editedByUser?.userId === user.sId;

  if (!connectorProvider) {
    return null;
  }

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
            <Avatar visual={dataSourceOwner?.imageUrl} size="sm" />
            <div>
              <span className="font-bold">
                {isDataSourceOwner ? "You" : dataSourceOwner?.fullName}
              </span>{" "}
              set it up
              {dataSourceOwner?.editedAt
                ? ` on ${formatTimestampToFriendlyDate(dataSourceOwner?.editedAt)}`
                : "."}
            </div>
          </div>
          {!isDataSourceOwner && (
            <div className="flex items-center justify-center gap-2">
              <Button
                label={`Request from ${dataSourceOwner?.fullName ?? ""}`}
                onClick={() => {
                  onRequestFromDataSourceClick();
                }}
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
