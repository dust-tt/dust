import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";
import { Icon } from "./Icon";
import { Label } from "./Label";
import { Tooltip } from "./Tooltip";

export const CHECKBOX_SIZES = ["xs", "sm"] as const;
export type CheckboxSizeType = (typeof CHECKBOX_SIZES)[number];

const checkboxStyles = cva(
  cn(
    "shrink-0 peer border transition duration-200 ease-in-out",
    "border-border-dark bg-background",
    "text-foreground",
    "focus-visible:ring-ring ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2",
    "hover:border-highlight hover:bg-highlight-50"
  ),
  {
    variants: {
      checked: {
        true: "data-[state=checked]:bg-primary data-[state=checked]:text-primary-50 data-[state=checked]:border-primary",
        partial:
          "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-50 data-[state=indeterminate]:border-primary",
        false: "",
      },
      isMutedAfterCheck: {
        true: "",
        false: "",
      },
      size: {
        xs: "h-4 w-4 rounded",
        sm: "h-5 w-5 rounded-md",
      },
    },
    compoundVariants: [
      {
        checked: true,
        isMutedAfterCheck: true,
        className:
          "data-[state=checked]:bg-faint/50 data-[state=checked]:border-transparent",
      },
    ],
    defaultVariants: {
      size: "sm",
      checked: false,
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
    VariantProps<typeof checkboxStyles> {
  checked?: CheckBoxStateType;
  tooltip?: string;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(
  (
    { className, size, checked, id, tooltip, isMutedAfterCheck, ...props },
    ref
  ) => {
    const checkbox = (
      <CheckboxPrimitive.Root
        ref={ref}
        id={id}
        className={cn(
          checkboxStyles({ checked, size, isMutedAfterCheck }),
          className
        )}
        checked={checked === "partial" ? "indeterminate" : checked}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
          <span className={cn(size === "xs" ? "-mt-px" : "")}>
            <Icon
              size="xs"
              visual={checked === "partial" ? Minus : Check}
              className="text-background"
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
  }
);

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

interface CheckboxWithTextProps extends CheckboxProps {
  text: string;
}

function CheckboxWithText({
  text,
  tooltip,
  id: idProp,
  size,
  ...props
}: CheckboxWithTextProps) {
  // Unique id per instance so checkbox and label stay associated (htmlFor/id); required for a11y and click-label-to-toggle.
  const generatedId = React.useId();
  const id = idProp ?? generatedId;

  const content = (
    <div className="items-top flex items-center space-x-2">
      <Checkbox id={id} size={size} {...props} />
      <Label
        htmlFor={id}
        className={cn(
          "cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          size === "xs" ? "text-xs" : "text-sm"
        )}
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
  size,
  ...props
}: CheckboxWithTextAndDescriptionProps) {
  // Unique id per instance so checkbox and label stay associated (htmlFor/id); required for a11y and click-label-to-toggle.
  const generatedId = React.useId();
  const id = idProp ?? generatedId;

  const content = (
    <div className="items-top flex space-x-2">
      <Checkbox id={id} size={size} {...props} />
      <div className="grid gap-1.5 leading-none">
        <Label
          htmlFor={id}
          className={cn(
            "cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
            size === "xs" ? "text-xs" : "text-sm"
          )}
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
