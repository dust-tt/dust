import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useEffect, useRef, useState } from "react";
import TreeView, { INode } from "react-accessible-treeview";
import {
  FaCheckSquare,
  FaFolder,
  FaRegSquare,
} from "react-icons/fa";
import { IoMdArrowDropdown, IoMdArrowDropright } from "react-icons/io";

import { GoogleDriveSelectedFolderType } from "@app/lib/connectors_api";
import { WorkspaceType } from "@app/types/user";

import { ActionButton, Button } from "./Button";

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
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      const foldersRes = await fetch(
        `/api/w/${props.owner.sId}/data_sources/google_drive/folders?connectorId=${props.connectorId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      setIsLoading(false);
      if (foldersRes.ok) {
        let fetchedFolders: GoogleDriveSelectedFolderType[] =
          await foldersRes.json();

        fetchedFolders = fetchedFolders.map((f) => {
          return { ...f, parent: f.parent || "root" };
        });
        setFolders(fetchedFolders);
      } else {
        window.alert("Could not fetch Google Drive folders");
      }
    })();
  }, [props.connectorId, props.owner.sId, setFolders, props.isOpen]);

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
                      Select the Google Drive folders to synchronize
                    </Dialog.Title>

                    {isLoading && (
                      <div className="mt-2 flex h-[500px] items-center  justify-center overflow-y-auto	rounded border-2 border-x-gray-100">
                        <div>Loading...</div>
                      </div>
                    )}
                    {!isLoading && folders.length > 0 && (
                      <div className="mt-2  h-[500px] overflow-y-auto	rounded border-2 border-x-gray-100">
                        <GoogleDriveFoldersPicker
                          folders={initialFolders}
                          owner={props.owner}
                          connectorId={props.connectorId}
                          onSelectedChange={(folders: string[]) => {
                            setSelectedFoldersToSave(folders);
                          }}
                        />
                      </div>
                    )}
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

function GoogleDriveFoldersPicker(props: {
  folders: GoogleDriveSelectedFolderType[];
  owner: WorkspaceType;
  connectorId: string;
  onSelectedChange: (selected: string[]) => void;
}) {
  const treeView = useRef(null);
  const nodes = props.folders.map((el): INode => {
    return { isBranch: el.children.length > 0, ...el };
  });
  const selectedIds = props.folders.filter((f) => f.selected).map((f) => f.id);

  return (
    <>
      <div className="">
        <div className="flex flex-row" role="alert" aria-live="polite"></div>
        <div className="checkbox">
          <TreeView
            ref={treeView}
            data={nodes}
            className="p-3"
            aria-label="Checkbox tree"
            multiSelect
            propagateSelect={false}
            defaultSelectedIds={selectedIds}
            defaultExpandedIds={selectedIds
              .map((id): string[] => getParentsIds(id, props.folders))
              .flat()}
            togglableSelect
            propagateSelectUpwards={false}
            onNodeSelect={({ treeState }) => {
              if (treeState?.selectedIds) {
                props.onSelectedChange(
                  Array.from(treeState.selectedIds).map((id) => id.toString())
                );
              }
            }}
            nodeRenderer={({
              element,
              isBranch,
              isExpanded,
              isSelected,
              isHalfSelected,
              getNodeProps,
              level,
              handleSelect,
              handleExpand,
            }) => {
              return (
                <div
                  {...getNodeProps({ onClick: handleExpand })}
                  style={{ marginLeft: 30 * (level - 1) }}
                  className="flex flex-row items-center leading-7 text-gray-900	"
                >
                  <div className="">
                    {isBranch && <ArrowIcon isOpen={isExpanded} />}
                    {!isBranch && (
                      <div className="opacity-0">
                        <ArrowIcon isOpen={false} />
                      </div>
                    )}
                  </div>
                  <div
                    className={`cursor-point  ${
                      isSelected || isHalfSelected
                        ? "text-blue-500"
                        : "text-gray-500"
                    }`}
                    onClick={(e) => {
                      handleSelect(e);
                      e.stopPropagation();
                    }}
                  >
                    <CheckBoxIcon
                      variant={
                        isHalfSelected ? "some" : isSelected ? "all" : "none"
                      }
                    />
                  </div>
                  <div className="ml-2 text-gray-600">
                    <FaFolder />
                  </div>
                  <div
                    className=" ml-1 cursor-pointer "
                    onClick={(e) => {
                      handleSelect(e);
                      e.stopPropagation();
                    }}
                  >
                    {element.name}
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>
    </>
  );
}

const ArrowIcon = ({ isOpen }: { isOpen: boolean }) => {
  if (!isOpen) {
    return <IoMdArrowDropright />;
  } else {
    return <IoMdArrowDropdown />;
  }
};

const CheckBoxIcon = ({ variant }: { variant: "all" | "none" | "some" }) => {
  switch (variant) {
    case "all":
      return <FaCheckSquare />;
    case "none":
      return <FaRegSquare />;
    case "some":
      return <FaRegSquare />;
    default:
      throw new Error("Invalid variant");
  }
};

function getParentsIds(
  id: string,
  tree: GoogleDriveSelectedFolderType[]
): string[] {
  const parents = [];
  let currentId: string | null = id;
  while (currentId) {
    const currentNode = tree.find((el) => el.id === currentId);
    if (currentNode) {
      if (currentNode.parent) {
        parents.push(currentNode.parent);
      }
    }

    currentId = currentNode?.parent || null;
  }
  return parents;
}
