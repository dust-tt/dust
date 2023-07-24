import { Dialog, Transition } from "@headlessui/react";
import {
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  FolderIcon,
} from "@heroicons/react/20/solid";
import { Fragment, useEffect, useState } from "react";

import { ConnectorProvider, ConnectorType } from "@app/lib/connectors_api";
import { useConnectorPermissions } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

import { Button } from "./Button";
import { Spinner } from "./Spinner";

const CONNECTOR_TYPE_TO_NAME: Record<ConnectorProvider, string> = {
  notion: "Notion",
  google_drive: "Google Drive",
  slack: "Slack",
  github: "GitHub",
};

function PermissionTreeChildren({
  owner,
  dataSource,
  parentId,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions(owner, dataSource, parentId);

  return (
    <div className="ml-2">
      <>
        {isResourcesLoading ? (
          <Spinner />
        ) : (
          <div className="space-y-1">
            {resources.map((r) => {
              return (
                <div key={r.internalId}>
                  <div className="ml-1 flex flex-row items-center py-1 text-base">
                    {r.type === "file" && (
                      <>
                        <DocumentTextIcon className="h-6 w-6 text-slate-300" />
                        <span className="ml-2">{r.title}</span>
                      </>
                    )}
                    {r.type === "database" && (
                      <>
                        <CircleStackIcon className="h-6 w-6 text-slate-300" />
                        <span className="ml-2">{r.title}</span>
                      </>
                    )}
                    {r.type === "folder" && (
                      <>
                        <FolderIcon className="h-6 w-6 text-slate-300" />
                        <span className="ml-2">{r.title}</span>
                      </>
                    )}
                    {r.type === "channel" && (
                      <>
                        <ChatBubbleLeftRightIcon className="h-6 w-6 text-slate-300" />
                        <span className="ml-2">#{r.title}</span>
                      </>
                    )}
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
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
}) {
  return (
    <div className="">
      <PermissionTreeChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
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
  const [syncrhonizedTimeAgo, setSyncrhonizedTimeAgo] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (connector.lastSyncSuccessfulTime)
      setSyncrhonizedTimeAgo(timeAgoFrom(connector.lastSyncSuccessfulTime));
  }, []);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={setOpen}>
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
                <div>
                  <div className="flex flex-row items-center">
                    <div className="mt-3 flex-initial sm:mt-5">
                      <Dialog.Title
                        as="h3"
                        className="text-xl font-semibold leading-6 text-gray-900"
                      >
                        {CONNECTOR_TYPE_TO_NAME[connector.type]} permissions
                      </Dialog.Title>
                      {syncrhonizedTimeAgo && (
                        <span className="text-gray-500">
                          Last sync ~{syncrhonizedTimeAgo} ago
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex flex-row">
                  <div className="flex flex-1"></div>
                  <div className="flex flex-initial">
                    <Button
                      onClick={() => {
                        setOpen(false);
                        onEditPermission();
                      }}
                    >
                      <Cog6ToothIcon className="mr-2 h-5 w-5" />
                      Edit permissions
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="mt-16">
                    <div className="px-2 text-sm text-gray-500">
                      Top-level resources accessible by this managed data
                      source:
                    </div>
                  </div>
                </div>
                <div className="mb-16 mt-8">
                  <PermissionTree owner={owner} dataSource={dataSource} />
                </div>
                <div className="mt-5 flex justify-end">
                  <div>
                    <Button
                      onClick={() => {
                        setOpen(false);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
