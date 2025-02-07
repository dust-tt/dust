import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, VariantProps } from "class-variance-authority";
import React from "react";

import { CheckIcon, DashIcon } from "@sparkle/icons/solid";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Label } from "./Label";
import { Tooltip } from "./Tooltip";

export const CHECKBOX_SIZES = ["xs", "sm"] as const;
type CheckboxSizeType = (typeof CHECKBOX_SIZES)[number];

const checkboxSizeVariant: Record<CheckboxSizeType, string> = {
  xs: "s-h-4 s-w-4 s-rounded",
  sm: "s-h-5 s-w-5 s-rounded-md",
};

const checkboxStyles = cva(
  cn(
    "s-shrink-0 s-peer s-border",
    "s-border-border-darker dark:s-border-border-darker-night",
    "dark:s-text-foreground-night s-text-foreground",
    "data-[state=checked]:s-text-white data-[state=checked]:s-border-primary",
    "focus-visible:s-ring-ring s-ring-offset-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2",
    "disabled:s-cursor-not-allowed disabled:s-opacity-50"
  ),
  {
    variants: {
      checked: {
        true: "data-[state=checked]:s-bg-primary dark:data-[state=checked]:s-bg-primary-night",
        partial:
          "data-[state=checked]:s-bg-muted-foreground dark:data-[state=checked]:s-bg-muted-foreground-night",
        false: "",
      },
      size: checkboxSizeVariant,
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
>(({ className, size, checked, id, ...props }, ref) => {
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
          />
        </span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  return checkbox;
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
