import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import React, { ReactNode } from "react";

import { LinkWrapper, LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { cn } from "@sparkle/lib/utils";

const hoverableVariants = cva(
  "s-cursor-pointer s-duration-200 hover:s-underline hover:s-underline-offset-2",
  {
    variants: {
      variant: {
        invisible: "hover:s-text-highlight-light active:s-text-highlight-dark",
        primary:
          "s-font-medium s-text-foreground hover:s-text-highlight-light active:s-text-highlight-dark",
        highlight:
          "s-font-medium s-text-highlight hover:s-text-highlight-light active:s-text-highlight-dark",
      },
    },
    defaultVariants: {
      variant: "invisible",
    },
  }
);

export const HOVERABLE_VARIANTS = [
  "invisible",
  "primary",
  "highlight",
] as const;
export type HoverableVariantType = (typeof HOVERABLE_VARIANTS)[number];

interface MetaHoverableProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof hoverableVariants> {
  asChild?: boolean;
}

const MetaHoverable = React.forwardRef<HTMLElement, MetaHoverableProps>(
  ({ className, variant, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "span";
    return (
      <Comp
        className={cn(variant && hoverableVariants({ variant }), className)}
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
  extends Omit<MetaHoverableProps, "children">,
    Omit<LinkWrapperProps, "children" | "className"> {
  children: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
}

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
