import React, { MouseEventHandler } from "react";

import { classNames, cn } from "@sparkle/lib/utils";

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
  idle: cn(
    "s-bg-primary-200 dark:s-bg-primary-600",
    "hover:s-bg-highlight-300 hover:dark:s-bg-highlight-800"
  ),
  selected: cn(
    "s-bg-highlight-400 dark:s-bg-highlight-400-night",
    "hover:s-bg-highlight-300 hover:dark:s-bg-highlight-200-night"
  ),
  disabled: cn(
    "s-bg-primary-200 dark:s-bg-primary-200-night",
    "hover:s-bg-primary-200 dark:hover:s-bg-primary-200-night",
    "s-cursor-not-allowed hover:s-cursor-not-allowed"
  ),
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
    disabled ? stateClasses.disabled : ""
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
        className={cn(
          "s-transform s-rounded-full s-bg-background s-drop-shadow s-transition-transform s-duration-300 s-ease-out",
          disabled && "s-opacity-50",
          size && cusrsorSizeClasses[size],
          selected ? cusrsorTranslateSizeClasses[size] : "s-translate-x-[2px]"
        )}
      />
    </div>
  );

  return SliderToggleContent;
}
