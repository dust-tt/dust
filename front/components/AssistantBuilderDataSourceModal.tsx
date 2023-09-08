import { Button, Cog6ToothIcon, XCircleIcon } from "@dust-tt/sparkle";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";

import { WorkspaceType } from "@app/types/user";

import { PermissionTree } from "./ConnectorPermissionsTree";

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
}: //   owner,
{
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
}) {
  function closeModal() {
    // TODO
    setOpen(false);
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className={"relative z-50"} onClose={closeModal}>
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
                      //   no
                    }}
                    labelVisible={true}
                    label="Re-authorize"
                    variant="tertiary"
                    size="xs"
                    icon={Cog6ToothIcon}
                  />
                  {/* TODO */}
                  {/* eslint-disable-next-line */}
                  {false ? (
                    <div className="flex gap-1">
                      <Button
                        labelVisible={true}
                        onClick={closeModal}
                        label="Cancel"
                        variant="secondary"
                        size="xs"
                      />
                      <Button
                        labelVisible={true}
                        // TODO
                        //   onClick={save}
                        label="Save"
                        variant="primary"
                        size="xs"
                      />
                    </div>
                  ) : (
                    <div onClick={closeModal} className="cursor-pointer">
                      <XCircleIcon className="h-6 w-6 text-gray-500" />
                    </div>
                  )}
                  <div className="mb-16 ml-2 mt-8">
                    {/* <PermissionTree owner={owner} /> */}
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
