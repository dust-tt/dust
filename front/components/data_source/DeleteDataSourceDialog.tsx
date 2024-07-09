import { Button } from "@dust-tt/sparkle";
import { Dialog, Transition } from "@headlessui/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Fragment, useState } from "react";

interface DeleteDataSourceDialogProps {
  handleDelete: () => void;
  dataSourceUsage: number;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteDataSourceDialog({
  handleDelete,
  dataSourceUsage,
  isOpen,
  setIsOpen,
}: DeleteDataSourceDialogProps) {
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);

  const onDelete = async () => {
    setIsSavingOrDeleting(true);
    await handleDelete();
    setIsSavingOrDeleting(false);
    setIsOpen(false);
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-30"
          onClose={() => {
            setIsOpen(false);
          }}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Removing Data Source
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      {dataSourceUsage} assistants currently use this Data
                      Source. Are you sure you want to remove?
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="tertiary"
                      size="sm"
                      label="Cancel"
                      disabled={isSavingOrDeleting}
                      onClick={() => {
                        setIsOpen(false);
                      }}
                    />
                    <Button
                      variant="primaryWarning"
                      size="sm"
                      label="Remove"
                      disabled={isSavingOrDeleting}
                      icon={TrashIcon}
                      onClick={onDelete}
                    />
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
