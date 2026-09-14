import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Icon } from "@sparkle/components/Icon";
import { Label } from "@sparkle/components/Label";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

export const radioStyles = cva(
  cn(
    "h-5 w-5 aspect-square rounded-full border transition duration-100 ease-out motion-reduce:transition-none active:scale-95",
    "border-border-form",
    "data-[state=checked]:border-border-form-active",
    "bg-background",
    "text-foreground",
    "flex items-center justify-center",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
    "checked:ring-0"
  )
);

export const radioIndicatorStyles = cva(
  cn(
    "h-3 w-3 bg-primary flex items-center justify-center rounded-full",
    // Quick pop-in on select; deselecting unmounts instantly, which is fine —
    // exits may be faster than entrances, and this is a high-frequency control.
    "animate-in fade-in-0 zoom-in-90 duration-150 ease-enter motion-reduce:animate-none"
  )
);

/**
 * Presents a set of mutually exclusive options where exactly one can be
 * selected at a time, composed of RadioGroupItem or RadioGroupCustomItem
 * children. Use it to choose a single value from a small set (roughly 2-6
 * options) worth showing at once; for many options use a Dropdown, and to
 * select more than one value use Checkbox.
 * @summary Single-choice group of radio options.
 */
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

/**
 * A standard labelled option of a RadioGroup, with an optional icon; for
 * richer custom content per option use RadioGroupCustomItem.
 * @summary Labelled radio option.
 */
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
  /** Vertical alignment of the radio button relative to the custom content. */
  iconPosition?: IconPosition;
  /** Custom content rendered next to the radio button in place of a plain label. */
  customItem: React.ReactNode;
  /** Extra content rendered below the radio row (e.g. a description or nested controls). */
  children?: React.ReactNode;
}

/**
 * A RadioGroup option that renders arbitrary custom content next to the radio
 * button, instead of RadioGroupItem's plain label.
 * @summary Radio option with custom content.
 */
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
          props.disabled && "opacity-70 [&_label]:cursor-not-allowed",
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
