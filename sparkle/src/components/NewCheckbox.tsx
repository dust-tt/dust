import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, VariantProps } from "class-variance-authority";
import * as React from "react";

import { CheckIcon, DashIcon, Icon } from "@sparkle/index_with_tw_base";
import { cn } from "@sparkle/lib/utils";

const checkboxStyles = cva(
  cn(
    "s-shrink-0 s-peer s-border s-border-primary-500 s-text-foreground",
    "data-[state=checked]:s-text-white data-[state=checked]:s-text-foreground",
    "focus-visible:s-ring-ring s-ring-offset-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2",
    "disabled:s-cursor-not-allowed disabled:s-opacity-50"
  ),
  {
    variants: {
      isPartial: {
        false: "data-[state=checked]:s-bg-foreground",
        true: "data-[state=checked]:s-bg-muted-foreground",
      },
      size: {
        xs: "s-h-4 s-w-4 s-rounded",
        sm: "s-h-5 s-w-5 s-rounded-md",
      },
    },
    defaultVariants: {
      size: "sm",
      isPartial: false,
    },
  }
);

interface NewCheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxStyles> {
  isPartial?: boolean;
}

const NewCheckbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  NewCheckboxProps
>(({ className, size = "sm", isPartial = false, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxStyles({ isPartial, size }), className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="s-flex s-items-center s-justify-center s-text-current">
      <span className={cn(size === "xs" ? "-s-mt-px" : "")}>
        <Icon size="xs" visual={isPartial ? DashIcon : CheckIcon} />
      </span>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

NewCheckbox.displayName = CheckboxPrimitive.Root.displayName;

export { NewCheckbox };
