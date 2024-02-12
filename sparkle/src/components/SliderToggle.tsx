import React, { MouseEventHandler } from "react";

import { classNames } from "@sparkle/lib/utils";

type SliderToggleProps = {
  onClick?: MouseEventHandler<HTMLElement>;
  size?: "xs" | "sm";
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses =
  "s-rounded-full s-cursor-pointer s-transition-colors s-duration-300 s-ease-out s-cursor-pointer s-flex s-items-center s-flex";

const sizeClasses = {
  xs: "s-h-7 s-w-10",
  sm: "s-h-9 s-w-14",
};

const cusrsorSizeClasses = {
  xs: "s-h-6 s-w-6",
  sm: "s-h-8 s-w-8",
};
const cusrsorTranslateSizeClasses = {
  xs: "s-translate-x-[14px]",
  sm: "s-translate-x-[22px]",
};

const stateClasses = {
  idle: "s-bg-structure-200 hover:s-bg-action-400",
  selected: "s-bg-success-300 hover:s-bg-success-200",
  disabled:
    "s-bg-structure-200 s-cursor-not-allowed hover:s-bg-structure-200 hover:s-cursor-not-allowed",
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
  size = "xs",
}: SliderToggleProps) {
  const combinedStateClasses = classNames(
    size ? sizeClasses[size] : "",
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
          "s-transform s-rounded-full s-drop-shadow s-transition-transform s-duration-300 s-ease-out",
          disabled ? "s-bg-structure-100" : "s-bg-white",
          size ? cusrsorSizeClasses[size] : "",
          selected ? cusrsorTranslateSizeClasses[size] : "s-translate-x-[2px]"
        )}
      />
    </div>
  );

  return SliderToggleContent;
}
