import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

export interface SwatchOption<T extends string = string> {
  value: T;
  /** Accessible name and hover title of the swatch, e.g. "Rose". */
  label: string;
  /** Background class painting the swatch, e.g. `bg-rose-500`. */
  className: string;
  disabled?: boolean;
}

export interface SwatchGroupProps<T extends string = string> {
  options: readonly SwatchOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Accent color". */
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A single-select row of round color swatches with the current choice ringed.
 * Built on a radio group: arrow keys move the selection, each swatch is named
 * by its `label`, and the row announces as one control. Use it when the
 * option *is* a color (accent, tag color); for options that need a label or a
 * glyph use `OptionTileGroup`.
 * @summary Round color swatches for a single-select color setting.
 */
export function SwatchGroup<T extends string = string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  className,
}: SwatchGroupProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next);
        if (option) {
          onValueChange(option.value);
        }
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      orientation="horizontal"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-label={option.label}
          title={option.label}
          className={cn(
            "size-6 shrink-0 rounded-full",
            option.className,
            // The ring uses the current foreground so it reads on any swatch
            // and any surface; the offset separates it from the swatch.
            "ring-offset-2 ring-offset-background transition-shadow duration-100 ease-out motion-reduce:transition-none",
            "hover:ring-2 hover:ring-border-dark",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-foreground",
            "data-[state=checked]:ring-2 data-[state=checked]:ring-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:ring-0"
          )}
        />
      ))}
    </RadioGroupPrimitive.Root>
  );
}
