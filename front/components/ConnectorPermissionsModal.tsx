import {
  Button,
  Checkbox,
  XCircleStrokeIcon as XCircleIcon,
} from "@dust-tt/sparkle";
import { Dialog, Transition } from "@headlessui/react";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import { Fragment, useState } from "react";
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
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeModal}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="h-5/5 fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative max-w-2xl transform overflow-hidden rounded-lg bg-white px-4 pb-4 text-left shadow-xl transition-all sm:p-6 lg:w-1/2">
                <div className="mt-5 flex items-start justify-between sm:mt-0">
                  <Button
                    onClick={() => {
                      onEditPermission();
                    }}
                    labelVisible={true}
                    label="Re-authorize"
                    type="tertiary"
                    size="xs"
                    icon={Cog6ToothIcon}
                  />
                  {Object.keys(updatedPermissionByInternalId).length ||
                  automaticallyIncludeNewResources !== null ? (
                    <div className="flex gap-1">
                      <Button
                        labelVisible={true}
                        onClick={closeModal}
                        label="Cancel"
                        type="secondary"
                        size="xs"
                      />
                      <Button
                        labelVisible={true}
                        onClick={save}
                        label="Save"
                        type="primary"
                        size="xs"
                      />
                    </div>
                  ) : (
                    <div onClick={closeModal} className="cursor-pointer">
                      <XCircleIcon className="h-6 w-6 text-gray-500" />
                    </div>
                  )}
                </div>
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
                        showExpand={
                          CONNECTOR_TYPE_TO_SHOW_EXPAND[connector.type]
                        }
                      />
                    </div>
                  </>
                ) : null}
                {isDefaultNewResourcePermissionError && (
                  <div className="text-red-300">
                    An unexpected error occurred
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
