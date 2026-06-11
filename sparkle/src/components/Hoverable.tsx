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
  invisible: cn("s:hover:text-highlight-light", "s:active:text-highlight-dark"),
  primary: cn(
    "s:font-semibold",
    "s:text-foreground s:dark:text-foreground-night",
    "s:hover:text-highlight-light s:dark:hover:text-highlight-light-night",
    "s:active:text-highlight-dark s:dark:active:text-highlight-dark-night"
  ),
  highlight: cn(
    "s:font-semibold",
    "s:text-highlight s:dark:text-highlight-night",
    "s:hover:text-highlight-light s:dark:hover:text-highlight-light-night",
    "s:active:text-highlight-dark s:dark:active:text-highlight-dark-night"
  ),
};

const variantStyle = cva(
  "s:cursor-pointer s:duration-200 s:hover:underline s:hover:underline-offset-2",
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
