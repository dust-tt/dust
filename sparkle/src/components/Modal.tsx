import { Dialog, Transition } from "@headlessui/react";
import React, { Fragment } from "react";

import { assertNever, classNames } from "@sparkle/lib/utils";

import { BarHeader, BarHeaderButtonBarProps } from "./BarHeader";
import { Button, ButtonProps } from "./Button";

const RIGHT_SIDE_MODAL_WIDTH = {
  normal: "sm:s-w-[448px]",
  wide: "sm:s-w-[50rem]",
  "ultra-wide": "sm:s-w-[80rem]",
} as const;

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  action?: ButtonProps;
  children: React.ReactNode;
  hasChanged: boolean;
  onSave?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  savingLabel?: string;
  title?: string;
} & (
  | {
      type: "right-side";
      width?: keyof typeof RIGHT_SIDE_MODAL_WIDTH;
    }
  | {
      type: "full-screen" | "default";
    }
);

export function Modal({
  isOpen,
  onClose,
  action,
  children,
  hasChanged,
  onSave,
  saveLabel = "Save",
  isSaving,
  savingLabel,
  title,
  ...props
}: ModalProps) {
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

  const justifyClass = (() => {
    switch (props.type) {
      case "right-side":
        return "s-justify-end";

      case "full-screen":
      case "default":
        return "s-justify-center";

      default:
        throw assertNever(props);
    }
  })();

  const outerContainerClasses = (() => {
    switch (props.type) {
      case "right-side":
      case "full-screen":
        return "s-h-full s-p-0";

      case "default":
        return "s-min-h-full s-p-4";

      default:
        throw assertNever(props);
    }
  })();

  const transitionEnterLeaveClasses = (() => {
    switch (props.type) {
      case "right-side":
        return "s-translate-x-full";

      case "full-screen":
      case "default":
        return "s-translate-y-4 sm:s-translate-y-0  sm:s-scale-95";

      default:
        throw assertNever(props);
    }
  })();

  const panelClasses = (() => {
    switch (props.type) {
      case "right-side":
        return classNames(
          "s-m-0 s-h-full s-max-h-full s-w-full s-max-w-full",
          RIGHT_SIDE_MODAL_WIDTH[props.width || "normal"]
        );

      case "full-screen":
        return "s-m-0 s-h-full s-max-h-full s-w-full s-max-w-full";

      case "default":
        return "s-max-w-2xl s-rounded-lg s-shadow-xl lg:s-w-1/2";

      default:
        throw assertNever(props);
    }
  })();

  const innerContainerClasses = (() => {
    switch (props.type) {
      case "right-side":
      case "full-screen":
        return "s-h-full s-overflow-y-auto";

      case "default":
        return "";

      default:
        throw assertNever(props);
    }
  })();

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
          <div className="s-fixed s-inset-0 s-bg-slate-800/70 s-transition-opacity" />
        </Transition.Child>

        <div className="s-fixed s-inset-0 s-z-50 s-overflow-y-auto">
          <div
            className={classNames(
              "s-flex s-items-center",
              justifyClass,
              outerContainerClasses
            )}
          >
            <Transition.Child
              as={Fragment}
              enter="s-ease-out s-duration-300"
              enterFrom={classNames("s-opacity-0", transitionEnterLeaveClasses)}
              enterTo="s-opacity-100 s-translate-y-0 sm:s-scale-100"
              leave="s-ease-in s-duration-200"
              leaveFrom="s-opacity-100 s-translate-y-0 sm:s-scale-100"
              leaveTo={classNames("s-opacity-0", transitionEnterLeaveClasses)}
            >
              <Dialog.Panel
                className={classNames(
                  "s-relative s-transform s-overflow-hidden s-bg-white s-px-3 s-transition-all sm:s-px-4",
                  panelClasses
                )}
              >
                <BarHeader
                  title={title || ""}
                  leftActions={action ? <Button {...action} /> : undefined}
                  rightActions={<BarHeader.ButtonBar {...buttonBarProps} />}
                />
                <div
                  className={classNames(
                    "s-pb-6 s-pt-14",
                    innerContainerClasses
                  )}
                >
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
