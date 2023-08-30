import {
  ArrowUpOnSquareIcon,
  Button,
  ClipboardCheckIcon,
  LinkStrokeIcon,
  SliderToggle,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Dialog, Popover, Transition } from "@headlessui/react";
import React, { Fragment, useEffect, useState } from "react";

import { classNames } from "@app/lib/utils";
import { ChatSessionVisibility } from "@app/types/chat";

export function AppLayoutChatTitle({
  readOnly,
  title,
  shareLink,
  onDelete,
  visibility,
  onUpdateVisibility,
}: {
  readOnly?: boolean;
  title: string;
  shareLink: string;
  onDelete?: () => void;
  visibility: ChatSessionVisibility;
  onUpdateVisibility: (visibility: ChatSessionVisibility) => void;
}) {
  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);
  const handleClick = async () => {
    await navigator.clipboard.writeText(shareLink || "");
    setCopyLinkSuccess(true);
    setTimeout(() => {
      setCopyLinkSuccess(false);
    }, 1000);
  };

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex h-full flex-row items-center">
      <div className="flex flex-initial font-bold">
        <div
          className={classNames(
            "w-48 overflow-hidden truncate sm:w-96 lg:w-auto lg:px-0"
          )}
        >
          <span>{title}</span>
        </div>
      </div>
      <div className="flex flex-1"></div>
      <div className="-ml-8 hidden flex-initial space-x-1 lg:ml-0 lg:flex">
        {!readOnly && onDelete && (
          <div className="flex flex-initial">
            <Button
              size="sm"
              labelVisible={false}
              tooltipPosition="below"
              type="secondaryWarning"
              label="Delete"
              icon={TrashIcon}
              onClick={onDelete}
            />
          </div>
        )}

        {!readOnly && (
          <>
            <Button
              size="sm"
              label="Share"
              icon={ArrowUpOnSquareIcon}
              type="secondary"
              onClick={() => setIsOpen(true)}
            />

            <Transition show={isOpen} as={Fragment}>
              <Dialog onClose={() => setIsOpen(false)}>
                <div className="fixed inset-0">
                  <div className="flex w-full flex-col items-end">
                    <Transition.Child
                      as={Fragment}
                      enter="transition ease-out duration-200"
                      enterFrom="transform -translate-y-4 opacity-0 scale-100"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <Dialog.Panel className="mx-16 mt-16 w-64 rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-100 focus:outline-none">
                        <div className="flex flex-col gap-y-3 px-3 py-3">
                          <div className="flex flex-row">
                            <div className="flex flex-col">
                              <div className="text-sm font-medium text-element-800">
                                Share with the Workspace
                              </div>
                              <div className="text-xs font-normal text-element-700">
                                Make visible to all your co-workers in "All
                                conversations".
                              </div>
                            </div>
                            <div>
                              <SliderToggle
                                selected={visibility === "workspace"}
                                onClick={() => {
                                  onUpdateVisibility(
                                    visibility === "workspace"
                                      ? "private"
                                      : "workspace"
                                  );
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex justify-center">
                            <Button
                              type="secondary"
                              size="sm"
                              label={
                                copyLinkSuccess ? "Copied!" : "Copy the link"
                              }
                              icon={
                                copyLinkSuccess
                                  ? ClipboardCheckIcon
                                  : LinkStrokeIcon
                              }
                              onClick={handleClick}
                            />
                          </div>
                        </div>
                      </Dialog.Panel>
                    </Transition.Child>
                  </div>
                </div>
              </Dialog>
            </Transition>
          </>
        )}
      </div>
    </div>
  );
}
