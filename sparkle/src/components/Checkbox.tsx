import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";
import { Label } from "./Label";
import { Tooltip } from "./Tooltip";

export const checkboxStyles = cva(
  cn(
    "h-4 w-4 rounded-md relative shrink-0 peer border transition duration-100 ease-out motion-reduce:transition-none",
    // Disabling the transition would make the press scale instantaneous, so disable the scale too.
    "active:scale-95 motion-reduce:active:scale-100",
    "border-border-form bg-background",
    "data-[state=checked]:border-border-form-active",
    "data-[state=indeterminate]:border-border-form-active",
    "text-foreground",
    "focus-visible:ring-ring ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:border-border-dark disabled:bg-background"
  )
);

// The checked state renders a dark rounded square that fills the box's inner
// content area; the "ring" is the box's own border showing through.
// Concentric corners: inner radius = outer radius (rounded-md, 6px) minus the
// 1px border the fill sits inside.
// Keep the fill mounted and full-sized so checked controls stay still on mount
// and the border never separates from the fill during the icon animation.
export const checkboxIndicatorStyles = cva(
  cn(
    "group/checkbox-indicator absolute inset-0 flex items-center justify-center rounded-[5px] opacity-0",
    "data-[state=checked]:opacity-100 data-[state=indeterminate]:opacity-100"
  ),
  {
    variants: {
      isMutedAfterCheck: {
        true: "bg-faint/50",
        false: "bg-foreground",
      },
    },
    defaultVariants: {
      isMutedAfterCheck: false,
    },
  }
);

export const checkboxIconStyles = cva(
  "absolute h-3 w-3 scale-90 text-background opacity-0 transition-[opacity,transform] duration-150 ease-enter motion-reduce:transition-none",
  {
    variants: {
      state: {
        checked:
          "group-data-[state=checked]/checkbox-indicator:scale-100 group-data-[state=checked]/checkbox-indicator:opacity-100",
        indeterminate:
          "group-data-[state=indeterminate]/checkbox-indicator:scale-100 group-data-[state=indeterminate]/checkbox-indicator:opacity-100",
      },
    },
  }
);

type CheckBoxStateType = boolean | "partial";

interface CheckboxProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
      "checked" | "defaultChecked"
    >,
    VariantProps<typeof checkboxIndicatorStyles> {
  /** Checked state: `true`, `false`, or `"partial"` for the indeterminate state. */
  checked?: CheckBoxStateType;
  /** Tooltip shown when hovering the checkbox. */
  tooltip?: string;
}

/**
 * Lets users turn an individual option on or off, or pick several options from a
 * list, supporting checked, unchecked, and indeterminate (`"partial"`) states.
 * Reserve `"partial"` for a parent controlling a partially-selected group, and
 * always associate a label. For a single choice among mutually exclusive options,
 * use RadioGroup instead; for a setting that takes effect immediately, consider
 * SliderToggle.
 * @summary On/off option checkbox.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, checked, id, tooltip, isMutedAfterCheck, ...props }, ref) => {
  const checkbox = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={id}
      className={cn(checkboxStyles(), className)}
      checked={checked === "partial" ? "indeterminate" : checked}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        className={checkboxIndicatorStyles({ isMutedAfterCheck })}
      >
        <Check className={checkboxIconStyles({ state: "checked" })} />
        <Minus className={checkboxIconStyles({ state: "indeterminate" })} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  return tooltip ? (
    <Tooltip label={tooltip} trigger={checkbox} tooltipTriggerAsChild />
  ) : (
    checkbox
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

interface CheckboxWithTextProps extends CheckboxProps {
  /** Label displayed next to the checkbox, associated for click-to-toggle. */
  text: string;
}

/**
 * A Checkbox with an associated inline text label (click the label to toggle).
 * @summary Checkbox with inline label.
 */
function CheckboxWithText({
  text,
  tooltip,
  id: idProp,
  ...props
}: CheckboxWithTextProps) {
  // Unique id per instance so checkbox and label stay associated (htmlFor/id); required for a11y and click-label-to-toggle.
  const generatedId = React.useId();
  const id = idProp ?? generatedId;

  const content = (
    <div className="items-top flex items-center space-x-2">
      <Checkbox id={id} {...props} />
      <Label
        htmlFor={id}
        className="cursor-pointer text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {text}
      </Label>
    </div>
  );

  return tooltip ? <Tooltip label={tooltip} trigger={content} /> : content;
}

interface CheckboxWithTextAndDescriptionProps extends CheckboxWithTextProps {
  /** Secondary muted text displayed under the label. */
  description: string;
}

/**
 * A Checkbox with an associated label and a muted description underneath.
 * @summary Checkbox with label and description.
 */
function CheckBoxWithTextAndDescription({
  text,
  description,
  tooltip,
  id: idProp,
  ...props
}: CheckboxWithTextAndDescriptionProps) {
  // Unique id per instance so checkbox and label stay associated (htmlFor/id); required for a11y and click-label-to-toggle.
  const generatedId = React.useId();
  const id = idProp ?? generatedId;

  const content = (
    <div className="items-top flex space-x-2">
      <Checkbox id={id} {...props} />
      <div className="grid gap-1.5 leading-none">
        <Label
          htmlFor={id}
          className="cursor-pointer text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {text}
        </Label>
        <p className={cn("text-xs", "text-muted-foreground")}>{description}</p>
      </div>
    </div>
  );

  return tooltip ? <Tooltip label={tooltip} trigger={content} /> : content;
}

export type { CheckboxProps };
export { CheckBoxWithTextAndDescription, Checkbox, CheckboxWithText };
