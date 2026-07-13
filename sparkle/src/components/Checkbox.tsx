import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";
import { Label } from "./Label";
import { Tooltip } from "./Tooltip";

export const checkboxStyles = cva(
  cn(
    "h-4 w-4 rounded-md relative shrink-0 peer border transition duration-200 ease-in-out motion-reduce:transition-none",
    "active:scale-95",
    "border-border-dark bg-background",
    "text-foreground",
    "focus-visible:ring-ring ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:border-border-dark disabled:bg-background"
  )
);

// The checked state renders a dark rounded square that fills the box's inner
// content area; the light "ring" is the box's own border showing through.
export const checkboxIndicatorStyles = cva(
  "absolute inset-0 flex items-center justify-center rounded-[3px]",
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

type CheckBoxStateType = boolean | "partial";

interface CheckboxProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
      "checked" | "defaultChecked"
    >,
    VariantProps<typeof checkboxIndicatorStyles> {
  checked?: CheckBoxStateType;
  tooltip?: string;
}

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
        className={checkboxIndicatorStyles({ isMutedAfterCheck })}
      >
        {checked === "partial" ? (
          <Minus className="h-3 w-3 text-background" />
        ) : (
          <Check className="h-3 w-3 text-background" />
        )}
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
  text: string;
}

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
  description: string;
}

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
