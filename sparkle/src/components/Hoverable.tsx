import { Slot } from "@radix-ui/react-slot";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

export const HOVERABLE_VARIANTS = [
  "invisible",
  "primary",
  "highlight",
] as const;

export type HoverableVariantType = (typeof HOVERABLE_VARIANTS)[number];

const hoverableVariants: Record<HoverableVariantType, string> = {
  invisible: cn("hover:text-highlight-light", "active:text-highlight-dark"),
  primary: cn(
    "font-medium",
    "text-foreground",
    "hover:text-highlight-light",
    "active:text-highlight-dark"
  ),
  // highlight-500 sits at 3.2:1 on white — below AA for body links.
  // 700 clears 4.5:1; dark mode keeps 500 (5.8:1 on the dark bg).
  highlight: cn(
    "font-medium",
    "text-highlight-700 dark:text-highlight-500",
    "hover:text-highlight-600 dark:hover:text-highlight-light",
    "active:text-highlight-800 dark:active:text-highlight-dark"
  ),
};

const variantStyle = cva(
  "cursor-pointer duration-200 hover:underline hover:underline-offset-2",
  {
    variants: {
      variant: hoverableVariants,
    },
    defaultVariants: {
      variant: "invisible",
    },
  }
);

interface MetaHoverableProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof variantStyle> {
  asChild?: boolean;
}

const MetaHoverable = React.forwardRef<HTMLElement, MetaHoverableProps>(
  ({ className, variant, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "span";
    return (
      <Comp
        className={cn(variant && variantStyle({ variant }), className)}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
MetaHoverable.displayName = "MetaHoverable";

export interface HoverableProps
  extends MetaHoverableProps,
    Omit<LinkWrapperProps, "children"> {}

const Hoverable = React.forwardRef<HTMLElement, HoverableProps>(
  ({ href, target, rel, children, variant, className, ...props }, ref) => {
    const innerElement = (
      <MetaHoverable
        ref={ref}
        variant={variant}
        className={className}
        {...props}
      >
        {children}
      </MetaHoverable>
    );

    return href ? (
      <LinkWrapper href={href} target={target} rel={rel}>
        {innerElement}
      </LinkWrapper>
    ) : (
      innerElement
    );
  }
);

Hoverable.displayName = "Hoverable";

export { Hoverable };
