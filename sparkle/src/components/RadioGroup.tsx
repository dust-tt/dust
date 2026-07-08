import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Icon } from "@sparkle/components/Icon";
import { Label } from "@sparkle/components/Label";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

export const radioStyles = cva(
  cn(
    "h-5 w-5 aspect-square rounded-full border transition duration-200 ease-in-out motion-reduce:transition-none active:scale-95",
    "border-border-dark",
    "bg-background",
    "text-foreground",
    "flex items-center justify-center",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
    "checked:ring-0"
  )
);

export const radioIndicatorStyles = cva(
  "h-3 w-3 bg-primary flex items-center justify-center rounded-full"
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
  > {
  label: string;
  icon?: React.ComponentType;
}

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, icon, label, id, ...props }, ref) => {
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
      className={cn(radioStyles(), className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className={radioIndicatorStyles()} />
    </RadioGroupPrimitive.Item>
  );

  const wrappedItem = (
    <div className="flex w-full items-center gap-2">
      {item}
      {icon && renderIcon(icon)}
      <Label
        htmlFor={id}
        className={cn(
          "cursor-pointer",
          props.disabled && "cursor-not-allowed opacity-70"
        )}
      >
        {label}
      </Label>
    </div>
  );

  return <div className="group w-full">{wrappedItem}</div>;
});

type IconPosition = "start" | "center" | "end";

interface RadioGroupCustomItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  iconPosition?: IconPosition;
  customItem: React.ReactNode;
  children?: React.ReactNode;
}

const RadioGroupCustomItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupCustomItemProps
>(
  (
    { className, customItem, iconPosition = "center", children, id, ...props },
    ref
  ) => {
    const item = (
      <RadioGroupPrimitive.Item
        ref={ref}
        id={id}
        className={cn(radioStyles(), className)}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className={radioIndicatorStyles()} />
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
