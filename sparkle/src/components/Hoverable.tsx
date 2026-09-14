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
  highlight: cn(
    "font-medium",
    // highlight-700 instead of highlight (500): 500 is 3.2:1 on white, below
    // the 4.5:1 WCAG AA floor for body text; 700 passes in both themes (the
    // dark theme inverts the scale, mapping 700 to blue-300).
    "text-highlight-700",
    "hover:text-highlight-light",
    "active:text-highlight-dark"
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

/**
 * An inline text element that reveals interactivity on hover — underline plus
 * a highlight color shift. Renders a link when `href` is set, otherwise a
 * clickable span for `onClick` handlers.
 *
 * Use `variant="highlight"` for link-colored text, `primary` for
 * foreground-colored labels that light up on hover, and the default
 * `invisible` for text that only shows affordance when hovered. For a real
 * button with padding and variants, use Button instead.
 *
 * @summary Inline hover-underlined text link or trigger.
 */
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
