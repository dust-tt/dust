import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import React, { Fragment, useRef } from "react";

import ConfettiBackground from "@sparkle/components/ConfettiBackground";
import Spinner from "@sparkle/components/Spinner";
import { classNames } from "@sparkle/lib/utils";

import { Button, ButtonVariantType } from "./Button";

export type BaseDialogProps = {
  backgroundType?: "confetti" | "snow" | "none";
  children: React.ReactNode;
  disabled?: boolean;
  isOpen: boolean;
  isSaving?: boolean;
  onValidate: () => void;
  title: string;
  validateLabel?: string;
  validateVariant?: ButtonVariantType;
  cancelLabel?: string;
};

export type DialogProps = BaseDialogProps & {
  alertDialog?: false;
  onCancel: () => void;
};

export type AlertDialogProps = BaseDialogProps & {
  alertDialog: true;
  onCancel?: () => void;
};

export function Dialog({
  backgroundType = "none",
  children,
  disabled,
  isOpen,
  isSaving,
  title,
  validateLabel = "Ok",
  validateVariant = "primary",
  onValidate,
  ...props
}: AlertDialogProps | DialogProps) {
  const referentRef = useRef<HTMLDivElement>(null);

  return (
    <Transition show={isOpen} as={Fragment} appear={true}>
      <HeadlessDialog
        as="div"
        className="s-relative s-z-50"
        // If it's an alert dialog, we don't want to close it when clicking outside.
        onClose={props.alertDialog ? () => {} : props.onCancel}
        role={props.alertDialog ? "alertdialog" : "dialog"}
      >
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
                  "s-relative s-rounded-xl s-border s-border-structure-100 s-bg-structure-0 s-p-4 s-shadow-xl s-transition-all",
                  "s-w-full sm:s-w-[448px]",
                  "s-flex s-flex-col s-gap-6"
                )}
                ref={referentRef}
              >
                <HeadlessDialog.Title className="s-text-element-950 s-truncate s-text-lg s-font-medium">
                  {title}
                </HeadlessDialog.Title>
                <div className="s-text-base s-text-element-700">{children}</div>
                <div className="s-flex s-w-full s-justify-end">
                  <Button.List>
                    {!isSaving && (
                      <>
                        {props.onCancel && (
                          <Button
                            label={props.cancelLabel ?? "Cancel"}
                            variant="tertiary"
                            onClick={props.onCancel}
                          />
                        )}
                        <Button
                          disabled={disabled}
                          label={validateLabel}
                          variant={validateVariant}
                          onClick={onValidate}
                        />
                      </>
                    )}
                    {isSaving && <Spinner variant="color" />}
                  </Button.List>
                </div>
                {backgroundType !== "none" && (
                  <div className="s-absolute s-bottom-0 s-left-0 s-right-0 s-top-0 s-z-0">
                    <ConfettiBackground
                      variant={backgroundType}
                      referentSize={referentRef}
                    />
                  </div>
                )}
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
