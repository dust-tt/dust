import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Icon } from "@sparkle/components/Icon";
import { Label } from "@sparkle/components/Label";
import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

export const radioStyles = cva(
  cn(
    "s:aspect-square s:rounded-full s:border s:transition s:duration-200 s:ease-in-out",
    "s:border-border-dark s:dark:border-primary-500",
    "s:bg-background s:dark:bg-background-night",
    "s:text-foreground s:dark:text-foreground-night",
    "s:flex s:items-center s:justify-center",
    "s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-offset-2 s:focus-visible:ring-ring",
    "s:hover:border-highlight s:hover:bg-highlight-50 s:dark:hover:bg-highlight-100-night s:hover:dark:border-highlight",
    "s:disabled:cursor-not-allowed s:disabled:opacity-50 s:disabled:border-border-dark s:disabled:dark:border-border-dark-night s:disabled:bg-background s:dark:disabled:bg-background-night",
    "s:checked:ring-0",
    "s:checked:bg-highlight-500 s:dark:checked:bg-highlight-500-night"
  ),
  {
    variants: {
      size: {
        xs: "s:h-4 s:w-4",
        sm: "s:h-5 s:w-5",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

export const radioIndicatorStyles = cva(
  "s:bg-primary s:dark:bg-primary-night s:flex s:items-center s:justify-center s:rounded-full",
  {
    variants: {
      size: {
        xs: "s:h-2 s:w-2",
        sm: "s:h-2.5 s:w-2.5",
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
      className={cn("s:grid s:gap-2", className)}
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
          "s:text-foreground s:dark:text-foreground-night",
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
      <div className="s:flex s:w-full s:items-center s:gap-2">
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

    return <div className="s:group s:w-full">{wrappedItem}</div>;
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
          "s:flex s:w-full s:flex-col",
          className,
          `s:items-${iconPosition}`
        )}
      >
        <div className="s:flex s:w-full s:items-center s:gap-2">
          {item}
          {customItem}
        </div>
        {children}
      </div>
    );
  }
);

export { RadioGroup, RadioGroupCustomItem, RadioGroupItem };
