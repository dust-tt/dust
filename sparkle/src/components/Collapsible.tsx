import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronRight } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Icon } from "./Icon";

const labelVariants = cva(
  "s:inline-flex s:transition-colors s:ease-out s:duration-400 s:box-border s:gap-x-2 s:select-none s:text-sm",
  {
    variants: {
      variant: {
        primary: "s:text-highlight-600 s:dark:text-highlight-600-night",
        secondary: "s:text-foreground s:dark:text-foreground-night",
      },
      disabled: {
        true: "s:text-muted s:dark:text-muted-night",
        false:
          "s:group-hover/col:text-highlight-500 s:dark:group-hover/col:text-highlight-500-night s:active:text-highlight-700 s:dark:active:text-highlight-700-night",
      },
    },
    defaultVariants: {
      variant: "primary",
      disabled: false,
    },
  }
);

const chevronVariants = cva("s:transition-transform s:duration-150", {
  variants: {
    variant: {
      primary: "s:text-muted-foreground s:dark:text-muted-foreground-night",
      secondary: "s:text-muted-foreground s:dark:text-muted-foreground-night",
    },
    disabled: {
      true: "s:text-muted s:dark:text-muted-night",
      false:
        "s:group-hover/col:text-highlight-500 s:dark:group-hover/col:text-highlight-500-night s:active:text-highlight-700 s:dark:active:text-highlight-700-night",
    },
  },
  defaultVariants: {
    variant: "primary",
    disabled: false,
  },
});

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
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>,
    Omit<VariantProps<typeof labelVariants>, "disabled"> {
  label?: string;
  hideChevron?: boolean;
}

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  CollapsibleTriggerProps
>(
  (
    {
      label,
      children,
      className,
      disabled = false,
      hideChevron = false,
      variant = "primary",
      ...props
    },
    ref
  ) => {
    return (
      <CollapsiblePrimitive.Trigger
        ref={ref}
        disabled={disabled}
        className={cn(
          "s:group/col s:flex s:w-full s:items-center s:gap-1 s:focus:outline-hidden s:focus:ring-0",
          disabled ? "s:cursor-default" : "s:cursor-pointer",
          className
        )}
        {...props}
      >
        {!hideChevron && (
          <span
            className={cn(
              "s:transition-transform s:duration-200",
              chevronVariants({ variant, disabled })
            )}
          >
            <Icon
              visual={ChevronRight}
              size="sm"
              className="s:block s:group-data-[state=open]/col:hidden"
            />
            <Icon
              visual={ChevronDown}
              size="sm"
              className="s:hidden s:group-data-[state=open]/col:block"
            />
          </span>
        )}
        {children ?? (
          <span className={labelVariants({ variant, disabled })}>{label}</span>
        )}
      </CollapsiblePrimitive.Trigger>
    );
  }
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const contentVariants = cva("s:overflow-hidden s:transition-all", {
  variants: {
    variant: {
      default: "s:text-foreground s:dark:text-foreground-night",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface CollapsibleContentProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>,
    VariantProps<typeof contentVariants> {}

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  CollapsibleContentProps
>(({ children, className, variant, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      contentVariants({ variant }),
      "s:data-[state=closed]:animate-collapse-up s:data-[state=open]:animate-collapse-down",
      className
    )}
    {...props}
  >
    {children}
  </CollapsiblePrimitive.Content>
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
