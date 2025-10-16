import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { ChevronDownIcon, ChevronRightIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

const labelVariants = cva(
  "s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none s-text-sm",
  {
    variants: {
      variant: {
        primary: "s-text-highlight-600 dark:s-text-highlight-600-night",
        secondary: "s-text-foreground dark:s-text-foreground-night",
      },
      disabled: {
        true: "s-text-muted dark:s-text-muted-night",
        false:
          "group-hover/col:s-text-highlight-500 dark:group-hover/col:s-text-highlight-500-night active:s-text-highlight-700 dark:active:s-text-highlight-700-night",
      },
    },
    defaultVariants: {
      variant: "primary",
      disabled: false,
    },
  }
);

const chevronVariants = cva("s-transition-transform s-duration-150", {
  variants: {
    variant: {
      primary: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      secondary: "s-text-muted-foreground dark:s-text-muted-foreground-night",
    },
    disabled: {
      true: "s-text-muted dark:s-text-muted-night",
      false:
        "group-hover/col:s-text-highlight-500 dark:group-hover/col:s-text-highlight-500-night active:s-text-highlight-700 dark:active:s-text-highlight-700-night",
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
  isOpen?: boolean;
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
      isOpen = false,
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
          "s-group/col s-flex s-w-full s-items-center s-gap-1 s-font-medium focus:s-outline-none focus:s-ring-0",
          disabled ? "s-cursor-default" : "s-cursor-pointer",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "s-transition-transform s-duration-200",
            chevronVariants({ variant, disabled })
          )}
        >
          <Icon
            visual={isOpen ? ChevronDownIcon : ChevronRightIcon}
            size="sm"
          />
        </span>
        {children ? (
          children
        ) : (
          <span className={labelVariants({ variant, disabled })}>{label}</span>
        )}
      </CollapsiblePrimitive.Trigger>
    );
  }
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const contentVariants = cva("s-overflow-hidden s-transition-all", {
  variants: {
    variant: {
      default: "s-text-foreground dark:s-text-foreground-night",
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
      "data-[state=closed]:s-animate-collapse-up data-[state=open]:s-animate-collapse-down",
      className
    )}
    {...props}
  >
    <div className="s-py-2">{children}</div>
  </CollapsiblePrimitive.Content>
));
CollapsibleContent.displayName = "CollapsibleContent";

export interface CollapsibleComponentProps {
  rootProps?: Omit<CollapsibleProps, "children" | "open">;
  triggerProps?: Omit<CollapsibleTriggerProps, "children" | "defaultOpen">;
  triggerChildren?: React.ReactNode;
  contentProps?: Omit<CollapsibleContentProps, "children">;
  contentChildren?: React.ReactNode;
}

const CollapsibleComponent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  CollapsibleComponentProps
>(
  (
    { rootProps, triggerProps, triggerChildren, contentProps, contentChildren },
    ref
  ) => {
    const [open, setOpen] = React.useState(!!rootProps?.defaultOpen);
    return (
      <Collapsible
        ref={ref}
        {...rootProps}
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          rootProps?.onOpenChange?.(open);
        }}
      >
        <CollapsibleTrigger {...triggerProps} isOpen={open}>
          {triggerChildren}
        </CollapsibleTrigger>
        <CollapsibleContent {...contentProps}>
          {contentChildren}
        </CollapsibleContent>
      </Collapsible>
    );
  }
);

export {
  Collapsible,
  CollapsibleComponent,
  CollapsibleContent,
  CollapsibleTrigger,
};
