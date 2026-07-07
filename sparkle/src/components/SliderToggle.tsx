import { cn } from "@sparkle/lib/utils";
import React, { type MouseEventHandler } from "react";

type SliderToggleProps = {
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses = cn(
  "shrink-0 h-5 w-8 rounded-full cursor-pointer flex items-center",
  // Track color and knob slide share timing so they animate as one unit.
  "transition-colors duration-200 ease-in-out motion-reduce:transition-none",
  "shadow-[inset_0px_-3px_3px_0px_rgba(255,255,255,0.25),inset_0px_0.5px_2px_0px_rgba(0,0,0,0.14)]"
);

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
}: SliderToggleProps) {
  const combinedStateClasses = cn(
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
          "h-4 w-4 transform rounded-full bg-white drop-shadow",
          "transition-transform duration-200 ease-in-out motion-reduce:transition-none",
          disabled && "opacity-50",
          selected ? "translate-x-[14px]" : "translate-x-[2px]"
        )}
      />
    </div>
  );

  return SliderToggleContent;
}
