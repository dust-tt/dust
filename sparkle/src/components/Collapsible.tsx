import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { ChevronDownIcon, ChevronRightIcon } from "@sparkle/icons/solid";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

export interface CollapsibleProps
  extends CollapsiblePrimitive.CollapsibleProps {
  children: React.ReactNode;
  className?: string;
}

const Collapsible = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  CollapsibleProps
>(({ children, className, ...props }, ref) => (
  <CollapsiblePrimitive.Root ref={ref} className={className} {...props}>
    {children}
  </CollapsiblePrimitive.Root>
));
Collapsible.displayName = "Collapsible";

export interface CollapsibleTriggerProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> {
  label?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  CollapsibleTriggerProps
>(
  (
    {
      label,
      children,
      className = "",
      disabled = false,
      variant = "primary",
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const labelClasses = {
      primary: {
        base: "s-text-action-500 dark:s-text-action-500-night s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
        hover:
          "group-hover/col:s-text-action-400 dark:group-hover/col:s-text-action-400-night",
        active: "active:s-text-action-600 dark:active:s-text-action-600-night",
        disabled: "s-element-500 dark:s-element-500-night",
      },

      secondary: {
        base: "s-text-foreground dark:s-text-foreground-night s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
        hover:
          "group-hover/col:s-text-action-500 dark:group-hover/col:s-text-action-500-night",
        active: "active:s-text-action-600 dark:active:s-text-action-600-night",
        disabled: "s-element-500 dark:s-element-500-night",
      },
    };

    const chevronClasses = {
      primary: {
        base: "s-text-element-600 dark:s-text-element-600-night",
        hover:
          "group-hover/col:s-text-action-400 dark:group-hover/col:s-text-action-400-night",
        active: "active:s-text-action-700 dark:active:s-text-action-700-night",
        disabled: "s-element-500 dark:s-element-500-night",
      },
      secondary: {
        base: "s-text-element-600 dark:s-text-element-600-night",
        hover:
          "group-hover/col:s-text-action-400 dark:group-hover/col:s-text-action-400-night",
        active: "active:s-text-action-700 dark:active:s-text-action-700-night",
        disabled: "s-element-500 dark:s-element-500-night",
      },
    };

    const finalLabelClasses = cn(
      labelClasses[variant].base,
      !disabled ? labelClasses[variant].active : "",
      !disabled ? labelClasses[variant].hover : "",
      disabled ? labelClasses[variant].disabled : ""
    );

    const finalChevronClasses = cn(
      chevronClasses[variant].base,
      !disabled ? chevronClasses[variant].active : "",
      !disabled ? chevronClasses[variant].hover : "",
      disabled ? chevronClasses[variant].disabled : "",
      "s-transition-transform s-duration-300"
    );

    return (
      <CollapsiblePrimitive.Trigger
        ref={ref}
        disabled={disabled}
        className={cn(
          disabled ? "s-cursor-default" : "s-cursor-pointer",
          className,
          "s-group/col s-flex s-items-center s-justify-items-center s-gap-1 s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0"
        )}
        onClick={() => setIsOpen((prev) => !prev)}
        {...props}
      >
        <div className="s-transition-transform s-duration-200 data-[state=open]:s-rotate-90">
          <Icon
            visual={isOpen ? ChevronDownIcon : ChevronRightIcon}
            size="sm"
            className={finalChevronClasses}
          />
        </div>
        {children ? (
          children
        ) : (
          <span className={finalLabelClasses}>{label}</span>
        )}
      </CollapsiblePrimitive.Trigger>
    );
  }
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

export interface CollapsibleContentProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content> {}

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  CollapsibleContentProps
>(({ children, className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      "s-overflow-hidden s-text-primary-500 dark:s-text-primary-500-night",
      "s-transition-all s-duration-300 s-ease-out",
      "data-[state=closed]:s-h-0 data-[state=closed]:s-opacity-0",
      "data-[state=open]:s-h-auto data-[state=open]:s-opacity-100",
      className
    )}
    {...props}
  >
    <div className="s-py-2">{children}</div>
  </CollapsiblePrimitive.Content>
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
