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
    "s:shrink-0 s:peer s:border s:transition s:duration-200 s:ease-in-out",
    "s:border-border-dark s:dark:border-border-dark-night s:bg-background s:dark:bg-background-night",
    "s:text-foreground s:dark:text-foreground-night",
    "s:focus-visible:ring-ring s:ring-offset-background s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-offset-2",
    "s:hover:border-highlight s:hover:bg-highlight-50 s:dark:hover:bg-highlight-100-night s:hover:dark:border-highlight",
    "s:disabled:cursor-not-allowed s:disabled:opacity-50 s:disabled:border-border-dark s:disabled:dark:border-border-dark-night s:disabled:bg-background s:dark:disabled:bg-background-night"
  ),
  {
    variants: {
      checked: {
        true: "s:data-[state=checked]:bg-primary s:dark:data-[state=checked]:bg-primary-night s:data-[state=checked]:text-white s:data-[state=checked]:border-primary",
        partial:
          "s:data-[state=indeterminate]:bg-primary s:dark:data-[state=indeterminate]:bg-primary-night s:data-[state=indeterminate]:text-white s:data-[state=indeterminate]:border-primary",
        false: "",
      },
      isMutedAfterCheck: {
        true: "",
        false: "",
      },
      size: {
        xs: "s:h-4 s:w-4 s:rounded",
        sm: "s:h-5 s:w-5 s:rounded-md",
      },
    },
    compoundVariants: [
      {
        checked: true,
        isMutedAfterCheck: true,
        className:
          "s:data-[state=checked]:bg-faint/50 s:data-[state=checked]:dark:bg-faint-night s:data-[state=checked]:border-transparent",
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
        <CheckboxPrimitive.Indicator className="s:flex s:items-center s:justify-center s:text-current">
          <span className={cn(size === "xs" ? "s:-mt-px" : "")}>
            <Icon
              size="xs"
              visual={checked === "partial" ? Minus : Check}
              className="s:text-background s:dark:text-background-night"
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
    <div className="s:items-top s:flex s:items-center s:space-x-2">
      <Checkbox id={id} size={size} {...props} />
      <Label
        htmlFor={id}
        className={cn(
          "s:cursor-pointer s:leading-none s:peer-disabled:cursor-not-allowed s:peer-disabled:opacity-70",
          size === "xs" ? "s:text-xs" : "s:text-sm"
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
    <div className="s:items-top s:flex s:space-x-2">
      <Checkbox id={id} size={size} {...props} />
      <div className="s:grid s:gap-1.5 s:leading-none">
        <Label
          htmlFor={id}
          className={cn(
            "s:cursor-pointer s:leading-none s:peer-disabled:cursor-not-allowed s:peer-disabled:opacity-70",
            size === "xs" ? "s:text-xs" : "s:text-sm"
          )}
        >
          {text}
        </Label>
        <p
          className={cn(
            "s:text-xs",
            "s:text-muted-foreground s:dark:text-muted-foreground-night"
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );

  return tooltip ? <Tooltip label={tooltip} trigger={content} /> : content;
}

export type { CheckboxProps };
export { CheckBoxWithTextAndDescription, Checkbox, CheckboxWithText };
