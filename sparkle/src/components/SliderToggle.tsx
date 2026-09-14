import { cn } from "@sparkle/lib/utils";
import React, { type ComponentType, type MouseEventHandler } from "react";

type SliderToggleProps = {
  /** Called on click when not disabled; flip `selected` in this handler. */
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  disabled?: boolean;
  /** Whether the toggle is on; the source of truth for its state. */
  selected?: boolean;
  /** Small icon rendered inside the knob, e.g. a lock to signal a restricted setting. */
  icon?: ComponentType<{ className?: string }>;
  // Mutes the active track color, e.g. to signal a setting that is on but
  // restricted (paired with `icon`) rather than a plain active toggle.
  faded?: boolean;
};

const baseClasses = cn(
  "relative shrink-0 h-5 w-8 rounded-full cursor-pointer flex items-center",
  // Track color and knob slide share timing so they animate as one unit.
  "transition-colors duration-200 ease-in-out motion-reduce:transition-none",
  "shadow-[inset_0px_-3px_3px_0px_rgba(255,255,255,0.25),inset_0px_0.5px_2px_0px_rgba(0,0,0,0.14)]"
);

// Hover darkens the track by the same amount in both states: a translucent
// overlay under the knob (::before paints below child content), like Button's
// hover tint. Dark mode lightens instead, matching the hover token direction.
const hoverDarkenClasses = cn(
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-full",
  "before:bg-black/[0.06] dark:before:bg-white/[0.08]",
  "before:opacity-0 hover:before:opacity-100",
  "before:transition-opacity before:duration-200 before:ease-in-out motion-reduce:before:transition-none"
);

const stateClasses = {
  idle: cn("bg-slider-toggle-bg-idle", hoverDarkenClasses),
  selected: cn("bg-highlight-400", hoverDarkenClasses),
  selectedFaded: cn("bg-highlight-400/50", hoverDarkenClasses),
  disabled: cn(
    "bg-primary-200",
    "hover:bg-primary-200",
    "before:hidden",
    "cursor-not-allowed hover:cursor-not-allowed"
  ),
};

/**
 * A compact on/off switch for toggling a single setting that takes effect immediately,
 * reflecting state via `selected` and supporting `disabled`. Use it for binary settings
 * that apply instantly without a separate save action, typically inside a
 * `SettingsList.Row`. For an option that is part of a form submitted later, or that needs
 * an inline label and description, prefer `Checkbox`.
 *
 * @summary Instant on/off switch.
 */
export function SliderToggle({
  onClick,
  disabled = false,
  className = "",
  selected = false,
  icon: Icon,
  faded = false,
}: SliderToggleProps) {
  const combinedStateClasses = cn(
    selected
      ? faded
        ? stateClasses.selectedFaded
        : stateClasses.selected
      : stateClasses.idle,
    disabled ? stateClasses.disabled : ""
  );

  const SliderToggleContent = (
    <div
      onClick={(e) => {
        if (!disabled) {
          onClick?.(e); // Run passed onClick event
        }
      }}
      className={cn(
        "group/slider",
        className,
        baseClasses,
        combinedStateClasses
      )}
    >
      <div
        id="cursor"
        className={cn(
          "h-4 w-4 transform rounded-full bg-white drop-shadow",
          "flex items-center justify-center",
          // Width shares the translate's timing: the hover stretch and the
          // slide must animate together so the knob stays edge-anchored.
          // (v4 translate-x-* sets the standalone `translate` property, so it
          // must be listed explicitly — `transform` alone won't transition it.)
          "transition-[transform,translate,width] duration-200 ease-in-out motion-reduce:transition-none",
          disabled && "opacity-50",
          selected ? "translate-x-[14px]" : "translate-x-[2px]",
          // On hover the knob stretches 2px toward the opposite side, anchored
          // to its resting edge — hinting the direction it will travel. When
          // selected, translate compensates so the right edge stays put.
          // Pressing reverts to resting geometry so the toggle travel runs the
          // full distance and lands exactly — otherwise the hover compensation
          // makes the knob stop 2px short until the pointer leaves.
          !disabled &&
            (selected
              ? "group-hover/slider:w-[18px] group-hover/slider:translate-x-[12px] group-active/slider:w-4 group-active/slider:translate-x-[14px]"
              : "group-hover/slider:w-[18px] group-active/slider:w-4")
        )}
      >
        {Icon && (
          <Icon className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
        )}
      </div>
    </div>
  );

  return SliderToggleContent;
}
