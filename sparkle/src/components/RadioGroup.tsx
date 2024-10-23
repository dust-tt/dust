import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cva, VariantProps } from "class-variance-authority";
import * as React from "react";

import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";

const radioStyles = cva(
  cn(
    "s-aspect-square s-rounded-full s-border s-border-border-darker s-text-foreground",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 focus-visible:s-ring-ring",
    "disabled:s-cursor-not-allowed disabled:s-opacity-50",
    "checked:s-ring-0 checked:s-bg-action-500"
  ),
  {
    variants: {
      size: {
        xs: "s-h-4 s-w-4",
        sm: "s-h-5 s-w-5",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

const radioIndicatorStyles = cva(
  "s-bg-primary s-flex s-items-center s-justify-center s-rounded-full",
  {
    variants: {
      size: {
        xs: "s-h-2 s-w-2 s-ml-[3px]",
        sm: "s-h-2.5 s-w-2.5 s-ml-1",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("s-grid s-gap-2", className)}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

interface RadioGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioStyles> {
  tooltipMessage?: string;
  tooltipAsChild?: boolean;
}

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(
  (
    { tooltipMessage, className, size, tooltipAsChild = false, ...props },
    ref
  ) => {
    const item = (
      <RadioGroupPrimitive.Item
        ref={ref}
        className={cn(radioStyles({ size }), className)}
        {...props}
      >
        <RadioGroupPrimitive.Indicator
          className={radioIndicatorStyles({ size })}
        />
      </RadioGroupPrimitive.Item>
    );

    return (
      <div
        className={cn(
          "s-group",
          size === "sm" ? "s-h-5 s-w-5" : "-s-mt-1.5 s-h-4 s-w-4"
        )}
      >
        {tooltipMessage ? (
          <Tooltip
            triggerAsChild={tooltipAsChild}
            trigger={item}
            label={<span>{tooltipMessage}</span>}
          />
        ) : (
          item
        )}
      </div>
    );
  }
);
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

type IconPosition = "start" | "center" | "end";

interface RadioGroupChoiceProps extends RadioGroupItemProps {
  iconPosition?: IconPosition;
}

const RadioGroupChoice = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupChoiceProps
>(({ className, size, iconPosition = "center", children, ...props }, ref) => {
  return (
    <div className={cn("s-flex", className, `s-items-${iconPosition}`)}>
      <RadioGroupItem
        ref={ref}
        className={cn(radioStyles({ size }))}
        {...props}
      />
      {children}
    </div>
  );
});

export { RadioGroup, RadioGroupChoice, RadioGroupItem };
