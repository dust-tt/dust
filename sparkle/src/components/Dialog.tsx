import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import React, { Fragment } from "react";

import { Spinner } from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

type ModalProps = {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onCancel: () => void;
  onValidate: () => void;
  cancelLabel?: string;
  validateLabel?: string;
  validateVariant?: "primary" | "primaryWarning";
  isSaving?: boolean;
};

export function Dialog({
  isOpen,
  children,
  onCancel,
  onValidate,
  cancelLabel = "Cancel",
  validateLabel = "Ok",
  validateVariant = "primary",
  title,
  isSaving,
}: ModalProps) {
  return (
    <Transition show={isOpen} as={Fragment} appear={true}>
      <HeadlessDialog as="div" className="s-relative s-z-50" onClose={onCancel}>
        <Transition.Child
          as={Fragment}
          enter="s-ease-out s-duration-150"
          enterFrom="s-opacity-0"
          enterTo="s-opacity-100"
          leave="s-ease-in s-duration-150"
          leaveFrom="s-opacity-100"
          leaveTo="s-opacity-0"
        >
          <div className="s-fixed s-inset-0 s-bg-structure-50/80 s-backdrop-blur-sm s-transition-opacity" />
        </Transition.Child>

        <div className="s-fixed s-inset-0 s-z-50">
          <div className="s-flex s-min-h-full s-items-center s-justify-center">
            <Transition.Child
              as={Fragment}
              enter="s-ease-out s-duration-300"
              enterFrom="s-opacity-0 s-translate-y-4 s-scale-95"
              enterTo="s-opacity-100 s-translate-y-0 s-scale-100"
              leave="s-ease-in s-duration-200"
              leaveFrom="s-opacity-100 s-translate-y-0 s-scale-100"
              leaveTo="s-opacity-0 s-translate-y-4 s-scale-95"
            >
              <HeadlessDialog.Panel
                className={classNames(
                  "s-rounded-xl s-border s-border-structure-100 s-bg-structure-0 s-p-4  s-shadow-xl s-transition-all",
                  "overflow-hidden s-w-full sm:s-w-[448px]",
                  "s-flex s-flex-col s-gap-6"
                )}
              >
                <HeadlessDialog.Title className="s-text-element-950 s-truncate s-text-lg s-font-medium">
                  {title}
                </HeadlessDialog.Title>
                <div className="s-text-base s-text-element-700">{children}</div>
                <div className="s-flex s-w-full s-justify-end">
                  <Button.List>
                    {!isSaving && (
                      <>
                        <Button
                          label={cancelLabel}
                          variant="tertiary"
                          onClick={onCancel}
                        />
                        <Button
                          label={validateLabel}
                          variant={validateVariant}
                          onClick={onValidate}
                        />
                      </>
                    )}
                    {isSaving && <Spinner />}
                  </Button.List>
                </div>
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
