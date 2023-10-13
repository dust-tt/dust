import { Dialog, Transition } from "@headlessui/react";
import React, { Fragment } from "react";

import { classNames } from "@sparkle/lib/utils";

import { BarHeader, BarHeaderButtonBarProps } from "./BarHeader";
import { Button, ButtonProps } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: ButtonProps;
  children: React.ReactNode;
  hasChanged: boolean;
  onSave?: () => void;
  title?: string;
  type?: "full-screen" | "right-side" | "default";
}

export function Modal({
  isOpen,
  onClose,
  action,
  children,
  hasChanged,
  onSave,
  title,
  type = "default",
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
          <div className="s-fixed s-inset-0 s-bg-slate-800/70 s-transition-opacity" />
        </Transition.Child>

        <div className="s-fixed s-inset-0 s-z-50 s-overflow-y-auto">
          <div
            className={classNames(
              "s-flex s-items-center",
              type === "right-side" ? "s-justify-end" : "s-justify-center",
              type === "full-screen" || type === "right-side"
                ? "s-h-full s-p-0"
                : "s-min-h-full s-p-4"
            )}
          >
            <Transition.Child
              as={Fragment}
              enter="s-ease-out s-duration-300"
              enterFrom={classNames(
                "s-opacity-0",
                type === "right-side"
                  ? "s-translate-x-16"
                  : "s-translate-y-4 sm:s-translate-y-0 sm:s-scale-95"
              )}
              enterTo="s-opacity-100 s-translate-y-0 sm:s-scale-100"
              leave="s-ease-in s-duration-200"
              leaveFrom="s-opacity-100 s-translate-y-0 sm:s-scale-100"
              leaveTo={classNames(
                "s-opacity-0",
                type === "right-side"
                  ? "s-translate-x-full"
                  : "s-translate-y-4 sm:s-translate-y-0  sm:s-scale-95"
              )}
            >
              <Dialog.Panel
                className={classNames(
                  "s-relative s-transform s-overflow-hidden s-bg-white s-px-3 s-transition-all sm:s-px-4",
                  type === "full-screen" || type === "right-side"
                    ? "s-m-0 s-h-full s-max-h-full"
                    : "s-max-w-2xl s-rounded-lg s-shadow-xl lg:s-w-1/2",
                  type === "full-screen"
                    ? "s-w-full s-max-w-full"
                    : type === "right-side"
                    ? "s-w-full s-max-w-full sm:s-w-[448px]"
                    : ""
                )}
              >
                <BarHeader
                  title={title || ""}
                  leftActions={action ? <Button {...action} /> : undefined}
                  rightActions={<BarHeader.ButtonBar {...buttonBarProps} />}
                />
                <div
                  className={`s-pb-6 s-pt-14 ${
                    type === "full-screen" || type === "right-side"
                      ? "s-h-full s-overflow-y-auto"
                      : ""
                  }`}
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
