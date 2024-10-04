import { Dialog, Transition } from "@headlessui/react";
import React, { Fragment } from "react";

import { classNames } from "@sparkle/lib/utils";

import { BarHeader, BarHeaderButtonBarProps } from "./BarHeader";
import { Button, ButtonProps } from "./Button";

export enum ModalType {
  Dialogue = "dialogue",
  FullScreen = "full-screen",
  Side = "side",
}

const variantToType = {
  "full-screen": ModalType.FullScreen,
  "side-md": ModalType.Side,
  dialogue: ModalType.Dialogue,
  "side-sm": ModalType.Side,
};
const variantSize = {
  "full-screen": "",
  "side-md": "sm:s-w-[50rem]",
  dialogue: "",
  "side-sm": "sm:s-w-[448px]",
};

const modalStyles = {
  [ModalType.Side]: {
    containerClasses: "s-h-full s-ml-auto",
    panelClasses:
      "s-h-full s-max-h-full s-shadow-xl s-border s-border-structure-100 s-w-full s-max-w-full",
    transitionEnterFrom: "s-opacity-0 s-translate-x-16",
    transitionEnterTo: "s-opacity-100 s-translate-x-0",
    transitionLeaveFrom: "s-opacity-100 s-translate-x-0",
    transitionLeaveTo: "s-opacity-0 s-translate-x-16",
    innerContainerClasses: "s-h-full s-overflow-y-auto",
  },
  [ModalType.FullScreen]: {
    containerClasses:
      "s-flex s-items-center s-justify-center s-h-full s-p-0 s-shadow-xl",
    panelClasses: "s-m-0 s-h-full s-max-h-full s-w-full s-max-w-full s-r-0",
    transitionEnterFrom: "s-opacity-0 s-translate-y-4 s-scale-95 s-rounded-xl",
    transitionEnterTo: "s-opacity-100 s-translate-y-0 s-scale-100 s-rounded-0",
    transitionLeaveFrom:
      "s-opacity-100 s-translate-y-0 s-scale-100 s-rounded-0",
    transitionLeaveTo: "s-opacity-0 s-translate-y-4 s-scale-95 s-rounded-xl",
    innerContainerClasses: "s-h-full s-overflow-y-auto",
  },
  [ModalType.Dialogue]: {
    containerClasses:
      "s-flex s-items-center s-justify-center s-min-h-full s-p-4",
    panelClasses:
      "s-w-full sm:s-w-[448px] overflow-hidden s-shadow-2xl s-rounded-xl s-border s-border-structure-100",
    transitionEnterFrom: "s-opacity-0 s-translate-y-4 s-scale-95",
    transitionEnterTo: "s-opacity-100 s-translate-y-0 s-scale-100",
    transitionLeaveFrom: "s-opacity-100 s-translate-y-0 s-scale-100",
    transitionLeaveTo: "s-opacity-0 s-translate-y-4 s-scale-95",
    innerContainerClasses: "",
  },
};

export type ModalProps = {
  action?: ButtonProps;
  alertModal?: boolean;
  children: React.ReactNode;
  className?: string;
  hasChanged: boolean;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  savingLabel?: string;
  title?: string;
  variant?: "full-screen" | "side-sm" | "side-md" | "dialogue";
};

const getModalClasses = (type: ModalType) => modalStyles[type] || {};

export function Modal({
  action,
  alertModal,
  children,
  className,
  hasChanged,
  isOpen,
  isSaving,
  onClose,
  onSave,
  saveLabel = "Save",
  savingLabel,
  title,
  variant = "side-sm",
}: ModalProps) {
  const type = variantToType[variant];

  if (variant === "dialogue") {
    console.warn(
      "Dialogue variant of Modal is deprecated. Please use either another variant of Modal or the Dialog component."
    );
  }

  const buttonBarProps: BarHeaderButtonBarProps = hasChanged
    ? {
        variant: "validate",
        onCancel: onClose,
        onSave: onSave,
        saveLabel,
        isSaving,
        savingLabel,
      }
    : {
        variant: "close",
        onClose: onClose,
      };

  const {
    containerClasses,
    transitionEnterFrom,
    transitionLeaveFrom,
    transitionEnterTo,
    transitionLeaveTo,
    panelClasses,
    innerContainerClasses,
  } = getModalClasses(type);

  return (
    <Transition show={isOpen} as={Fragment} appear={true}>
      <Dialog
        as="div"
        className="s-fixed s-absolute s-inset-0 s-z-50 s-overflow-hidden"
        onClose={() => {
          // Close modal on outside click if no changes or not an alert.
          if (!hasChanged && !alertModal) {
            onClose();
          }
        }}
      >
        {/* Smoke screen and transition */}
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

        {/* Panel and transition */}
        <div className={classNames(containerClasses, variantSize[variant])}>
          <Transition.Child
            as={Fragment}
            enter="s-ease-out s-duration-300"
            enterFrom={transitionEnterFrom}
            enterTo={transitionEnterTo}
            leave="s-ease-in s-duration-200"
            leaveFrom={transitionLeaveFrom}
            leaveTo={transitionLeaveTo}
          >
            <Dialog.Panel
              className={classNames(
                "s-absolute s-transform s-bg-structure-0 s-px-3 s-transition-all sm:s-px-4",
                panelClasses,
                variantSize[variant]
              )}
            >
              <BarHeader
                title={title || ""}
                leftActions={action ? <Button {...action} /> : undefined}
                rightActions={
                  alertModal ? undefined : (
                    <BarHeader.ButtonBar {...buttonBarProps} />
                  )
                }
              />
              <div
                className={classNames(
                  "s-pb-6 s-pt-16",
                  innerContainerClasses,
                  className ?? ""
                )}
              >
                {children}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
