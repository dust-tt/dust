import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useEffect, useState } from "react";

import { GoogleDriveSelectedFolderType } from "@app/lib/connectors_api";
import { WorkspaceType } from "@app/types/user";

import { ActionButton, Button } from "./Button";
import GoogleDriveFoldersPicker from "./GoogleDriveFoldersPicker";

export default function GoogleDriveFoldersPickerModal(props: {
  owner: WorkspaceType;
  connectorId: string;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [selectedFoldersToSave, setSelectedFoldersToSave] = useState<
    string[] | undefined
  >(undefined);

  const [folders, setFolders] = useState<GoogleDriveSelectedFolderType[]>([]);

  useEffect(() => {
    void (async () => {
      const foldersRes = await fetch(
        `/api/w/${props.owner.sId}/data_sources/google_drive/folders?connectorId=${props.connectorId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (foldersRes.ok) {
        let folders: GoogleDriveSelectedFolderType[] = await foldersRes.json();

        folders = folders.map((f) => {
          return { ...f, parent: f.parent || "root" };
        });
        setFolders(folders);
      } else {
        window.alert("Could not fetch Google Drive folders");
      }
    })();
  }, []);

  const onSave = async (folders: string[]) => {
    const res = await fetch(
      `/api/w/${props.owner.sId}/data_sources/google_drive/folders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folders: folders,
          connectorId: props.connectorId.toString(),
        }),
      }
    );
    if (!res.ok) {
      window.alert("Failed to save folders");
    }
  };

  const rootFolder: GoogleDriveSelectedFolderType = {
    name: "",
    id: "root",
    children: folders.filter((f) => f.parent === "root").map((c) => c.id),
    parent: null,
    selected: false,
  };
  const initialFolders = [rootFolder, ...folders];

  return (
    <Transition.Root show={props.isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={props.setOpen}>
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

        <div className="fixed inset-0 z-10 h-4/5 overflow-y-auto">
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
              <Dialog.Panel className="sm:max-w-3/4 relative w-1/2 transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:p-6">
                <div>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center ">
                    <img src="/static/google_drive_32x32.png" />
                  </div>
                  <div className="mt-3 text-center sm:mt-5">
                    <Dialog.Title
                      as="h3"
                      className="text-base font-semibold leading-6 text-gray-900"
                    >
                      Select the Drive folders to synchronize
                    </Dialog.Title>
                    <div className="mt-2 h-[500px] overflow-y-auto rounded border-2	border-x-gray-100">
                      {folders.length > 0 && (
                        <GoogleDriveFoldersPicker
                          folders={initialFolders}
                          owner={props.owner}
                          connectorId={props.connectorId}
                          onSelectedChange={(folders: string[]) => {
                            setSelectedFoldersToSave(folders);
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <div>
                    <Button
                      onClick={() => {
                        props.setOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="ml-3">
                    <ActionButton
                      onClick={async () => {
                        if (selectedFoldersToSave) {
                          await onSave(selectedFoldersToSave);
                        }
                        props.setOpen(false);
                      }}
                    >
                      Save
                    </ActionButton>
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
