import { Transition } from "@headlessui/react";
import React from "react";

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
};

export function Popup({
  show,
  chipLabel,
  description,
  buttonLabel,
  buttonClick,
  className,
}: PopupProps) {
  return (
    <Transition
      show={show}
      enter="s-transition-opacity s-duration-300"
      enterFrom="s-opacity-0"
      enterTo="s-opacity-100"
      leave="s-transition-opacity s-duration-300"
      leaveFrom="s-opacity-100"
      leaveTo="s-opacity-0"
      className={classNames(
        "s-z-30 s-flex s-w-64 s-flex-col s-gap-3 s-rounded-lg s-border s-border-amber-100 s-bg-amber-50 s-p-4 s-shadow-lg",
        className || ""
      )}
    >
      <div>
        <Chip color="red">{chipLabel}</Chip>
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
    </Transition>
  );
}
