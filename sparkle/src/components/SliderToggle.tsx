import { cn } from "@sparkle/lib/utils";
import React, { type MouseEventHandler } from "react";

type SliderToggleProps = {
  onClick?: MouseEventHandler<HTMLElement>;
  size?: "xs" | "sm";
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses =
  "s:rounded-full s:cursor-pointer s:transition-colors s:duration-300 s:ease-out s:cursor-pointer s:flex s:items-center s:flex";

const sizeClasses = {
  xs: "s:h-7 s:w-10",
  sm: "s:h-9 s:w-14",
};

const cusrsorSizeClasses = {
  xs: "s:h-6 s:w-6",
  sm: "s:h-8 s:w-8",
};
const cusrsorTranslateSizeClasses = {
  xs: "s:translate-x-[14px]",
  sm: "s:translate-x-[22px]",
};

const stateClasses = {
  idle: cn("s:bg-primary-200", "s:hover:bg-highlight-300"),
  selected: cn("s:bg-highlight-400"),
  disabled: cn(
    "s:bg-primary-200",
    "s:hover:bg-primary-200",
    "s:cursor-not-allowed s:hover:cursor-not-allowed"
  ),
};

export function SliderToggle({
  onClick,
  disabled = false,
  className = "",
  selected = false,
  size = "xs",
}: SliderToggleProps) {
  const combinedStateClasses = cn(
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
      className={cn(className, baseClasses, combinedStateClasses)}
    >
      <div
        id="cursor"
        className={cn(
          "s:transform s:rounded-full s:bg-background s:drop-shadow s:transition-transform s:duration-300 s:ease-out",
          disabled && "s:opacity-50",
          size && cusrsorSizeClasses[size],
          selected ? cusrsorTranslateSizeClasses[size] : "s:translate-x-[2px]"
        )}
      />
    </div>
  );

  return SliderToggleContent;
}
