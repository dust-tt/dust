import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Icon } from "@sparkle/components/Icon";
import { Label } from "@sparkle/components/Label";
import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

export const radioStyles = cva(
  cn(
    "aspect-square rounded-full border transition duration-200 ease-in-out",
    "border-border-dark",
    "bg-background",
    "text-foreground",
    "flex items-center justify-center",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
    "hover:border-highlight hover:bg-highlight-50",
    "checked:ring-0",
    "checked:bg-highlight-500"
  ),
  {
    variants: {
      size: {
        xs: "h-4 w-4",
        sm: "h-5 w-5",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

export const radioIndicatorStyles = cva(
  "bg-primary flex items-center justify-center rounded-full",
  {
    variants: {
      size: {
        xs: "h-2 w-2",
        sm: "h-2.5 w-2.5",
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
      className={cn("grid gap-2", className)}
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
        className={cn("text-foreground", extraClass)}
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
      <div className="flex w-full items-center gap-2">
        {tooltipMessage ? (
          <Tooltip trigger={item} label={tooltipMessage} />
        ) : (
          item
        )}
        {icon && renderIcon(icon)}
        <Label
          htmlFor={id}
          {...labelProps}
          className={cn(
            "cursor-pointer",
            props.disabled && "cursor-not-allowed opacity-70",
            labelProps?.className
          )}
        >
          {label}
        </Label>
      </div>
    );

    return <div className="group w-full">{wrappedItem}</div>;
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
          "flex w-full flex-col",
          className,
          `items-${iconPosition}`
        )}
      >
        <div className="flex w-full items-center gap-2">
          {item}
          {customItem}
        </div>
        {children}
      </div>
    );
  }
);

export { RadioGroup, RadioGroupCustomItem, RadioGroupItem };
