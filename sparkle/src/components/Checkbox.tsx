import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, VariantProps } from "class-variance-authority";
import React from "react";

import { CheckIcon, DashIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Label } from "./Label";
import { Tooltip } from "./Tooltip";

export const CHECKBOX_SIZES = ["xs", "sm"] as const;
export type CheckboxSizeType = (typeof CHECKBOX_SIZES)[number];

const checkboxStyles = cva(
  cn(
    "s-shrink-0 s-peer s-border s-transition s-duration-200 s-ease-in-out",
    "s-border-border-dark dark:s-border-border-dark-night s-bg-background dark:s-bg-background-night",
    "s-text-foreground dark:s-text-foreground-night",
    "focus-visible:s-ring-ring s-ring-offset-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2",
    "hover:s-border-highlight hover:s-bg-highlight-50 dark:hover:s-bg-highlight-100-night hover:dark:s-border-highlight",
    "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-border-border-dark disabled:dark:s-border-border-dark-night disabled:s-bg-background dark:disabled:s-bg-background-night"
  ),
  {
    variants: {
      checked: {
        true: "data-[state=checked]:s-bg-primary dark:data-[state=checked]:s-bg-primary-night data-[state=checked]:s-text-white data-[state=checked]:s-border-primary",
        partial:
          "data-[state=indeterminate]:s-bg-primary dark:data-[state=indeterminate]:s-bg-primary-night data-[state=indeterminate]:s-text-white data-[state=indeterminate]:s-border-primary",
        false: "",
      },
      size: {
        xs: "s-h-4 s-w-4 s-rounded",
        sm: "s-h-5 s-w-5 s-rounded-md",
      },
    },
    defaultVariants: {
      size: "sm",
      checked: false,
    },
  }
);

type CheckBoxStateType = boolean | "partial";

interface CheckboxProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
      "checked" | "defaultChecked"
    >,
    VariantProps<typeof checkboxStyles> {
  checked?: CheckBoxStateType;
  tooltip?: string;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size, checked, id, tooltip, ...props }, ref) => {
  const checkbox = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={id}
      className={cn(checkboxStyles({ checked, size }), className)}
      checked={checked === "partial" ? "indeterminate" : checked}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="s-flex s-items-center s-justify-center s-text-current">
        <span className={cn(size === "xs" ? "-s-mt-px" : "")}>
          <Icon
            size="xs"
            visual={checked === "partial" ? DashIcon : CheckIcon}
            className="s-text-background dark:s-text-background-night"
          />
        </span>
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
  id,
  ...props
}: CheckboxWithTextProps) {
  const content = (
    <div className="s-items-top s-flex s-items-center s-space-x-2">
      <Checkbox id={id} {...props} />
      <Label
        htmlFor={id}
        className="s-cursor-pointer s-text-sm s-leading-none peer-disabled:s-cursor-not-allowed peer-disabled:s-opacity-70"
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
  id,
  ...props
}: CheckboxWithTextAndDescriptionProps) {
  const content = (
    <div className="s-items-top s-flex s-space-x-2">
      <Checkbox id={id} {...props} />
      <div className="s-grid s-gap-1.5 s-leading-none">
        <Label
          htmlFor={id}
          className="s-cursor-pointer s-text-sm s-leading-none peer-disabled:s-cursor-not-allowed peer-disabled:s-opacity-70"
        >
          {text}
        </Label>
        <p
          className={cn(
            "s-text-xs",
            "s-text-muted-foreground dark:s-text-muted-foreground-night"
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );

  return tooltip ? <Tooltip label={tooltip} trigger={content} /> : content;
}

export { Checkbox, CheckboxWithText, CheckBoxWithTextAndDescription };
export type { CheckboxProps };
