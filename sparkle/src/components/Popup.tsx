import { Transition } from "@headlessui/react";
import React from "react";

import { IconButton } from "@sparkle/components/IconButton";
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
          "s-z-30 s-flex s-w-64 s-flex-col s-gap-3 s-rounded-xl s-border s-border-pink-100 s-bg-pink-50 s-p-4 s-shadow-xl",
          className || ""
        )}
      >
        <div className="s-flex">
          <Chip color="pink">{chipLabel}</Chip>
          {onClose && (
            <div className="-s-mr-1 -s-mt-1 s-flex s-grow s-items-start s-justify-end">
              <IconButton
                icon={XMarkIcon}
                onClick={onClose}
                variant="secondary"
                size="sm"
              />
            </div>
          )}
        </div>
        <div className="s-text-sm s-font-normal s-text-element-900">
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
