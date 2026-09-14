import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronRight } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Icon } from "./Icon";

const labelVariants = cva(
  "inline-flex transition-colors ease-out duration-400 box-border gap-x-2 select-none text-sm",
  {
    variants: {
      variant: {
        primary: "text-highlight-600",
        secondary: "text-foreground",
      },
      disabled: {
        true: "text-muted",
        false: "group-hover/col:text-highlight-500 active:text-highlight-700",
      },
    },
    defaultVariants: {
      variant: "primary",
      disabled: false,
    },
  }
);

const chevronVariants = cva("transition-transform duration-150", {
  variants: {
    variant: {
      primary: "text-muted-foreground",
      secondary: "text-muted-foreground",
    },
    disabled: {
      true: "text-muted",
      false: "group-hover/col:text-highlight-500 active:text-highlight-700",
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

/**
 * A disclosure primitive that shows or hides a region of content. Compose it with
 * a CollapsibleTrigger (pass a `label` for the default chevron toggle) and a
 * CollapsibleContent wrapping the hidden region. Use it to progressively disclose
 * secondary content (details, advanced options) behind a toggle.
 * @summary Show/hide disclosure container.
 */
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
  /** Text for the default chevron toggle; ignored when custom children are provided. */
  label?: string;
  /** Hide the open/closed chevron indicator. */
  hideChevron?: boolean;
}

/**
 * The toggle of a Collapsible: pass a `label` for the standard chevron affordance,
 * or custom children for a bespoke trigger.
 * @summary Collapsible toggle trigger.
 */
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
          "group/col flex w-full items-center gap-1 focus:outline-hidden focus:ring-0",
          disabled ? "cursor-default" : "cursor-pointer",
          className
        )}
        {...props}
      >
        {!hideChevron && (
          <span
            className={cn(
              "transition-transform duration-200",
              chevronVariants({ variant, disabled })
            )}
          >
            <Icon
              visual={ChevronRight}
              size="sm"
              className="block group-data-[state=open]/col:hidden"
            />
            <Icon
              visual={ChevronDown}
              size="sm"
              className="hidden group-data-[state=open]/col:block"
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

const contentVariants = cva("overflow-hidden transition-all", {
  variants: {
    variant: {
      default: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface CollapsibleContentProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>,
    VariantProps<typeof contentVariants> {
  /**
   * Set to false to open and close instantly. Worth doing for high-frequency
   * toggles, where the height animation reads as lag rather than motion.
   * Note that no animation means no animationend event.
   */
  animated?: boolean;
}

/**
 * The hidden region of a Collapsible, revealed with a height animation
 * (disable via `animated={false}`).
 * @summary Collapsible hidden content.
 */
const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  CollapsibleContentProps
>(({ children, className, variant, animated = true, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      contentVariants({ variant }),
      animated && [
        "data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down",
        // Open/close still works, it just snaps instead of sliding.
        "motion-reduce:animate-none",
      ],
      className
    )}
    {...props}
  >
    {children}
  </CollapsiblePrimitive.Content>
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
