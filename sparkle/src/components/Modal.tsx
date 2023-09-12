import { Dialog, Transition } from "@headlessui/react";
import React, { Fragment } from "react";

import { BarHeader, BarHeaderButtonBarProps } from "./BarHeader";
import { ButtonProps } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: ButtonProps;
  children: React.ReactNode;
  hasChanged: boolean;
  onSave?: () => void;
  title?: string;
}

export function Modal({
  isOpen,
  onClose,
  children,
  hasChanged,
  onSave,
  title,
}: ModalProps) {
  const buttonBarProps: BarHeaderButtonBarProps = hasChanged
    ? {
        variant: "validate",
        onCancel: onClose,
        onSave: onSave,
      }
    : {
        variant: "close",
        onClose: onClose,
      };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="s-relative s-z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="s-ease-out s-duration-300"
          enterFrom="s-opacity-0"
          enterTo="s-opacity-100"
          leave="s-ease-in s-duration-200"
          leaveFrom="s-opacity-100"
          leaveTo="s-opacity-0"
        >
          <div className="s-fixed s-inset-0 s-bg-gray-500 s-bg-opacity-75 s-transition-opacity" />
        </Transition.Child>

        <div className="s-h-5/5 s-fixed s-inset-0 s-z-50 s-overflow-y-auto">
          <div className="s-flex s-min-h-full s-items-end s-justify-center s-p-4 s-text-center sm:s-items-center sm:s-p-0">
            <Transition.Child
              as={Fragment}
              enter="s-ease-out s-duration-300"
              enterFrom="s-opacity-0 s-translate-y-4 sm:s-translate-y-0 sm:s-scale-95"
              enterTo="s-opacity-100 s-translate-y-0 sm:s-scale-100"
              leave="s-ease-in s-duration-200"
              leaveFrom="s-opacity-100 s-translate-y-0 sm:s-scale-100"
              leaveTo="s-opacity-0 s-translate-y-4 sm:s-translate-y-0 sm:s-scale-95"
            >
              <Dialog.Panel className="s-relative s-max-w-2xl s-transform s-overflow-hidden s-rounded-lg s-bg-white s-px-4 s-pb-4 s-shadow-xl s-transition-all sm:s-p-6 lg:s-w-1/2">
                <div className="s-mt-16">
                  <BarHeader
                    title={title || ""}
                    rightActions={<BarHeader.ButtonBar {...buttonBarProps} />}
                  />
                  {children}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
