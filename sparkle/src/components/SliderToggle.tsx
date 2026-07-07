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
  "shrink-0 rounded-full cursor-pointer transition-colors duration-300 ease-out flex items-center";

const sizeClasses = {
  xs: "h-7 w-10",
  sm: "h-9 w-14",
};

const cusrsorSizeClasses = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
};
const cusrsorTranslateSizeClasses = {
  xs: "translate-x-[14px]",
  sm: "translate-x-[22px]",
};

const stateClasses = {
  idle: cn("bg-slider-toggle-bg-idle", "hover:bg-highlight-300"),
  selected: cn("bg-highlight-400"),
  disabled: cn(
    "bg-primary-200",
    "hover:bg-primary-200",
    "cursor-not-allowed hover:cursor-not-allowed"
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
          "transform rounded-full bg-white drop-shadow transition-transform duration-300 ease-out",
          disabled && "opacity-50",
          size && cusrsorSizeClasses[size],
          selected ? cusrsorTranslateSizeClasses[size] : "translate-x-[2px]"
        )}
      />
    </div>
  );

  return SliderToggleContent;
}
