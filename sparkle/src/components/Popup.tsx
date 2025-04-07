import { Transition } from "@headlessui/react";
import React from "react";

import { XMarkIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";
import { Chip } from "./Chip";

type PopupProps = {
  show: boolean;
  chipLabel: string;
  description: string;
  buttonLabel: string;
  buttonClick: () => void;
  className?: string;
  onClose?: () => void;
};

export function Popup({
  show,
  chipLabel,
  description,
  buttonLabel,
  buttonClick,
  className,
  onClose,
}: PopupProps) {
  return (
    <Transition
      show={show}
      enter="s-transition-opacity s-duration-300"
      appear={true}
      enterFrom="s-opacity-0"
      enterTo="s-opacity-100"
      leave="s-transition-opacity s-duration-300"
      leaveFrom="s-opacity-100"
      leaveTo="s-opacity-0"
    >
      <div
        className={classNames(
          "s-z-30 s-flex s-w-64 s-flex-col s-gap-3 s-rounded-xl s-border s-p-4 s-shadow-xl",
          "s-border-pink-100 dark:s-border-pink-100-night",
          "s-bg-pink-50 dark:s-bg-pink-50-night",
          className || ""
        )}
      >
        <div className="s-flex">
          <Chip color="warning">{chipLabel}</Chip>
          {onClose && (
            <div className="-s-mr-1 -s-mt-1 s-flex s-grow s-items-start s-justify-end">
              <Button
                icon={XMarkIcon}
                onClick={onClose}
                variant="ghost"
                size="sm"
              />
            </div>
          )}
        </div>
        <div className="s-text-sm s-font-normal s-text-foreground dark:s-text-foreground-night">
          {description}
        </div>
        <div className="s-self-center">
          <Button
            variant="primary"
            size="sm"
            label={buttonLabel}
            onClick={buttonClick}
          />
        </div>
      </div>
    </Transition>
  );
}
