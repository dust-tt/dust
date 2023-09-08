import React, { MouseEventHandler } from "react";

import { classNames } from "@sparkle/lib/utils";

type SliderToggleProps = {
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses =
  "s-box-border s-h-6 s-w-11 s-rounded-full s-border s-border-structure-300 dark:s-border-structure-300-dark s-transition-colors s-duration-300 s-ease-out s-cursor-pointer";

const stateClasses = {
  idle: "s-bg-structure-200 hover:s-bg-action-400",
  selected: "s-bg-success-400 hover:s-bg-success-300",
  disabled: "s-bg-structure-300 s-cursor-not-allowed",
  dark: {
    idle: "dark:s-bg-structure-200-dark dark:hover:s-bg-action-400",
    selected: "dark:s-bg-success-400-dark",
    disabled: "dark:s-bg-structure-300-dark",
  },
};

export function SliderToggle({
  onClick,
  disabled = false,
  className = "",
  selected = false,
}: SliderToggleProps) {
  const combinedStateClasses = classNames(
    selected ? stateClasses.selected : stateClasses.idle,
    disabled ? stateClasses.disabled : "",
    selected ? stateClasses.dark.selected : stateClasses.dark.idle,
    disabled ? stateClasses.dark.disabled : ""
  );

  const SliderToggleContent = (
    <div
      onClick={(e) => {
        if (!disabled) {
          onClick?.(e); // Run passed onClick event
        }
      }}
      className={classNames(className, baseClasses, combinedStateClasses)}
    >
      <div
        id="cursor"
        className={classNames(
          "s-m-px s-h-5 s-w-5 s-transform s-rounded-full s-bg-white s-drop-shadow s-transition-transform s-duration-300 s-ease-out",
          selected ? "s-translate-x-full" : ""
        )}
      />
    </div>
  );

  return SliderToggleContent;
}
