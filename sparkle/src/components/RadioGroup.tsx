import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cva, VariantProps } from "class-variance-authority";
import * as React from "react";

import { Tooltip } from "@sparkle/components/Tooltip";
import { CircleIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const radioStyles = cva(
  cn(
    "s-aspect-square s-h-4 s-w-4 s-rounded-full s-border s-text-foreground s-ring-offset-background",
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

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("s-grid", className)}
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
    return (
      <div className="s-group">
        {tooltipMessage ? (
          <Tooltip
            triggerAsChild={tooltipAsChild}
            trigger={
              <RadioGroupPrimitive.Item
                ref={ref}
                className={cn(radioStyles({ size }), className)}
                {...props}
              >
                <RadioGroupPrimitive.Indicator className="s-flex s-items-center s-justify-center">
                  <CircleIcon
                    className={cn(
                      size === "xs" ? "s-h-2.5 s-w-2.5" : "s-h-3 s-w-3",
                      "s-fill-current s-text-current focus:s-bg-action-50-dark"
                    )}
                  />
                </RadioGroupPrimitive.Indicator>
              </RadioGroupPrimitive.Item>
            }
            label={<span>{tooltipMessage}</span>}
          />
        ) : (
          <RadioGroupPrimitive.Item
            ref={ref}
            className={cn(radioStyles({ size }), className)}
            {...props}
          >
            <RadioGroupPrimitive.Indicator className="s-flex s-items-center s-justify-center">
              <CircleIcon
                className={cn(
                  size === "xs" ? "s-h-2.5 s-w-2.5" : "s-h-3 s-w-3",
                  "s-fill-current s-text-current focus:s-bg-action-50-dark"
                )}
              />
            </RadioGroupPrimitive.Indicator>
          </RadioGroupPrimitive.Item>
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
