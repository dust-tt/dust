import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Icon } from "@sparkle/components/Icon";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

export interface OptionTile<T extends string = string> {
  value: T;
  label: string;
  /** Icon shown above the label. Ignored when `visual` is provided. */
  icon?: React.ComponentType;
  /** Custom content shown above the label instead of an icon (e.g. a type specimen). */
  visual?: React.ReactNode;
  disabled?: boolean;
}

export interface OptionTileGroupProps<T extends string = string> {
  options: readonly OptionTile<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Theme". */
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A single-select row of equal-width compact tiles, each showing an icon (or
 * custom visual) above a label, with the current choice outlined in the
 * highlight color. Sized to its content, so it fits a `SettingsList.Row`
 * `action` slot. Built on a radio
 * group, so it is keyboard navigable with arrow keys and announces as one
 * control. Use it for a small set (2-4) of mutually exclusive settings such as
 * theme or font; for longer or descriptive choices use `RadioGroup`, and for
 * agent-prompt answers use `OptionCard`.
 * @summary Segmented tiles for a small single-select setting.
 */
export function OptionTileGroup<T extends string = string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  className,
}: OptionTileGroupProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => {
        // Radix hands back the string we gave it; options are the only source.
        const option = options.find((o) => o.value === next);
        if (option) {
          onValueChange(option.value);
        }
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      orientation="horizontal"
      className={cn("grid auto-cols-fr grid-flow-col gap-2", className)}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "flex min-w-24 flex-col items-center justify-center gap-1 px-3 py-2",
            // Surface-agnostic chrome: no own background, so the tile sits on
            // whatever it is placed on (page, panel, modal), and a border that
            // stays lighter than every dark surface (the plain `border` token
            // is darker than the dark modal surface).
            "rounded-2xl border border-border dark:border-border-dark bg-transparent",
            // Muted glyph and label at rest; the selected tile reads in the
            // full foreground, like an active Tab.
            "text-muted-foreground data-[state=checked]:text-foreground",
            "transition-colors duration-100 ease-out motion-reduce:transition-none",
            "hover:bg-foreground/5",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-highlight-200/70",
            "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
            // Selected: a highlight outline, no fill, so the tile's own
            // visual (icon or specimen) stays the focus.
            "data-[state=checked]:border-highlight data-[state=checked]:shadow-[inset_0_0_0_1px_var(--color-highlight)]"
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-6 items-center justify-center"
          >
            {option.visual ??
              (option.icon && <Icon visual={option.icon} size="md" />)}
          </span>
          <span className="label-sm truncate">{option.label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
