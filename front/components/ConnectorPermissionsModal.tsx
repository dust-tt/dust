import {
  Button,
  Checkbox,
  DocumentTextIcon,
  XCircleStrokeIcon as XCircleIcon,
} from "@dust-tt/sparkle";
import { Dialog, Transition } from "@headlessui/react";
import {
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  FolderIcon,
} from "@heroicons/react/20/solid";
import { Fragment, useEffect, useState } from "react";

import {
  ConnectorPermission,
  ConnectorProvider,
  ConnectorResourceType,
  ConnectorType,
} from "@app/lib/connectors_api";
import { useConnectorPermissions } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

import { Spinner } from "./Spinner";

const CONNECTOR_TYPE_TO_NAME: Record<ConnectorProvider, string> = {
  notion: "Notion",
  google_drive: "Google Drive",
  slack: "Slack",
  github: "GitHub",
};

const CONNECTOR_TYPE_TO_RESOURCE_NAME: Record<ConnectorProvider, string> = {
  notion: "top-level Notion pages or databases",
  google_drive: "Google Drive folders",
  slack: "Slack channels",
  github: "GitHub repositories",
};

const PERMISSIONS_EDITABLE_CONNECTOR_TYPES: Set<ConnectorProvider> = new Set([
  "slack",
]);

export type IconComponentType =
  | typeof DocumentTextIcon
  | typeof FolderIcon
  | typeof CircleStackIcon
  | typeof ChatBubbleLeftRightIcon;

function getIconForType(type: ConnectorResourceType): IconComponentType {
  switch (type) {
    case "file":
      return DocumentTextIcon;
    case "folder":
      return FolderIcon;
    case "database":
      return CircleStackIcon;
    case "channel":
      return ChatBubbleLeftRightIcon;
    default:
      ((n: never) => {
        throw new Error("Unreachable " + n);
      })(type);
  }
}

function PermissionTreeChildren({
  owner,
  dataSource,
  parentId,
  onPermissionUpdate,
  canUpdatePermissions,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  canUpdatePermissions: boolean;
  onPermissionUpdate: ({
    internalId,
    permission,
  }: {
    internalId: string;
    permission: ConnectorPermission;
  }) => void;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions(owner, dataSource, parentId);

  const [localStateByInternalId, setLocalStateByInternalId] = useState<
    Record<string, boolean>
  >({});

  return (
    <div className="ml-2">
      <>
        {isResourcesLoading ? (
          <Spinner />
        ) : (
          <div className="space-y-1">
            {resources.map((r) => {
              const IconComponent = getIconForType(r.type);
              const titlePrefix = r.type === "channel" ? "#" : "";
              return (
                <div key={r.internalId}>
                  <div className="ml-1 flex flex-row items-center py-1 text-base">
                    <IconComponent className="h-6 w-6 text-slate-300" />
                    <span className="ml-2">{`${titlePrefix}${r.title}`}</span>
                    {canUpdatePermissions ? (
                      <div className="flex-grow">
                        <Checkbox
                          className="ml-auto"
                          checked={
                            localStateByInternalId[r.internalId] ??
                            ["read", "read_write"].includes(r.permission)
                          }
                          onChange={(checked) => {
                            setLocalStateByInternalId((prev) => ({
                              ...prev,
                              [r.internalId]: checked,
                            }));
                            onPermissionUpdate({
                              internalId: r.internalId,
                              permission: checked ? "read_write" : "write",
                            });
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isResourcesError && <div className="text-red-300">Failed to load</div>}
      </>
    </div>
  );
}

function PermissionTree({
  owner,
  dataSource,
  onPermissionUpdate,
  canUpdatePermissions,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  canUpdatePermissions: boolean;
  onPermissionUpdate: ({
    internalId,
    permission,
  }: {
    internalId: string;
    permission: ConnectorPermission;
  }) => void;
}) {
  return (
    <div className="">
      <PermissionTreeChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
        canUpdatePermissions={canUpdatePermissions}
        onPermissionUpdate={onPermissionUpdate}
      />
    </div>
  );
}

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
  const [synchronizedTimeAgo, setSynchronizedTimeAgo] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (connector.lastSyncSuccessfulTime)
      setSynchronizedTimeAgo(timeAgoFrom(connector.lastSyncSuccessfulTime));
  }, []);

  const [updatedPermissionByInternalId, setUpdatedPermissionByInternalId] =
    useState<Record<string, ConnectorPermission>>({});

  function closeModal() {
    setOpen(false);
    setTimeout(() => {
      setUpdatedPermissionByInternalId({});
    }, 300);
  }

  async function save() {
    try {
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
        window.alert("Failed to save permissions");
      }
    } catch (e) {
      console.error(e);
      window.alert("An unexpected error occurred");
    }

    closeModal();
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={closeModal}>
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

        <div className="h-5/5 fixed inset-0 z-10 overflow-y-auto">
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
                <div className="flex items-start justify-between sm:mt-5">
                  <div>
                    <Dialog.Title
                      as="h3"
                      className="text-xl font-semibold leading-6 text-gray-900"
                    >
                      {CONNECTOR_TYPE_TO_NAME[connector.type]} permissions
                    </Dialog.Title>
                    {synchronizedTimeAgo && (
                      <span className="text-gray-500">
                        Last synchronized ~{synchronizedTimeAgo} ago
                      </span>
                    )}
                    <div className="mt-4">
                      <Button
                        onClick={() => {
                          onEditPermission();
                        }}
                        label="Re-authorize"
                        type="tertiary"
                        size="xs"
                        icon={Cog6ToothIcon}
                      />
                    </div>
                  </div>
                  <div>
                    {Object.keys(updatedPermissionByInternalId).length ? (
                      <div className="flex gap-1">
                        <Button
                          onClick={closeModal}
                          label="Cancel"
                          type="secondary"
                          size="xs"
                        />
                        <Button
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
                </div>
                <div>
                  <div className="mt-16">
                    <div className="px-2 text-sm text-gray-500">
                      Dust has access to the following{" "}
                      {CONNECTOR_TYPE_TO_RESOURCE_NAME[connector.type]}:
                    </div>
                  </div>
                </div>
                <div className="mb-16 mt-8">
                  <PermissionTree
                    owner={owner}
                    dataSource={dataSource}
                    canUpdatePermissions={PERMISSIONS_EDITABLE_CONNECTOR_TYPES.has(
                      connector.type
                    )}
                    onPermissionUpdate={({ internalId, permission }) => {
                      setUpdatedPermissionByInternalId((prev) => ({
                        ...prev,
                        [internalId]: permission,
                      }));
                    }}
                  />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
