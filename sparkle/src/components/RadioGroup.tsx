import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cva, VariantProps } from "class-variance-authority";
import * as React from "react";

import { Icon } from "@sparkle/components/Icon";
import { Label } from "@sparkle/components/Label";
import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";

export const radioStyles = cva(
  cn(
    "s-aspect-square s-rounded-full s-border s-transition s-duration-200 s-ease-in-out",
    "s-border-border-dark dark:s-border-primary-500",
    "s-bg-background dark:s-bg-background-night",
    "s-text-foreground dark:s-text-foreground-night",
    "s-flex s-items-center s-justify-center",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 focus-visible:s-ring-ring",
    "hover:s-border-highlight hover:s-bg-highlight-50 dark:hover:s-bg-highlight-100-night hover:dark:s-border-highlight",
    "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-border-border-dark disabled:dark:s-border-border-dark-night disabled:s-bg-background dark:disabled:s-bg-background-night",
    "checked:s-ring-0",
    "checked:s-bg-highlight-500 dark:checked:s-bg-highlight-500-night"
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

export const radioIndicatorStyles = cva(
  "s-bg-primary dark:s-bg-primary-night s-flex s-items-center s-justify-center s-rounded-full",
  {
    variants: {
      size: {
        xs: "s-h-2 s-w-2",
        sm: "s-h-2.5 s-w-2.5",
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
  extends Omit<
      React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
      "children"
    >,
    VariantProps<typeof radioStyles> {
  tooltipMessage?: string;
  label: string;
  labelProps?: Omit<React.ComponentPropsWithoutRef<typeof Label>, "children">;
  icon?: React.ComponentType;
}

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(
  (
    { tooltipMessage, className, icon, size, label, labelProps, id, ...props },
    ref
  ) => {
    const renderIcon = (visual: React.ComponentType, extraClass = "") => (
      <Icon
        visual={visual}
        size="sm"
        className={cn(
          "s-text-foreground dark:s-text-foreground-night",
          extraClass
        )}
      />
    );

    const item = (
      <RadioGroupPrimitive.Item
        ref={ref}
        id={id}
        className={cn(radioStyles({ size }), className)}
        {...props}
      >
        <RadioGroupPrimitive.Indicator
          className={radioIndicatorStyles({ size })}
        />
      </RadioGroupPrimitive.Item>
    );

    const wrappedItem = (
      <div className="s-flex s-w-full s-items-center s-gap-2">
        {tooltipMessage ? (
          <Tooltip trigger={item} label={tooltipMessage} />
        ) : (
          item
        )}
        {icon && renderIcon(icon)}
        <Label htmlFor={id} {...labelProps}>
          {label}
        </Label>
      </div>
    );

    return <div className="s-group s-w-full">{wrappedItem}</div>;
  }
);

type IconPosition = "start" | "center" | "end";

interface RadioGroupCustomItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioStyles> {
  iconPosition?: IconPosition;
  customItem: React.ReactNode;
  children?: React.ReactNode;
}

const RadioGroupCustomItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupCustomItemProps
>(
  (
    {
      className,
      size,
      customItem,
      iconPosition = "center",
      children,
      id,
      ...props
    },
    ref
  ) => {
    const item = (
      <RadioGroupPrimitive.Item
        ref={ref}
        id={id}
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
          "s-flex s-w-full s-flex-col",
          className,
          `s-items-${iconPosition}`
        )}
      >
        <div className="s-flex s-w-full s-items-center s-gap-2">
          {item}
          {customItem}
        </div>
        {children}
      </div>
    );
  }
);

export { RadioGroup, RadioGroupCustomItem, RadioGroupItem };
