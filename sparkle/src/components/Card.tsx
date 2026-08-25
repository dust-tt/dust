import type { IconOnlyButtonProps } from "@sparkle/components/Button";
import { Button } from "@sparkle/components/Button";
import type { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import {
  noHrefLink,
  SparkleContext,
  type SparkleContextLinkType,
} from "@sparkle/context";
import { XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

export const CARD_VARIANTS = [
  "primary",
  "active",
  "secondary",
  "tertiary",
  "highlight",
  "warning",
] as const;
export type CardVariantType = (typeof CARD_VARIANTS)[number];

export const CARD_SIZES = ["xs", "sm", "md", "lg"] as const;
export type CardSizeType = (typeof CARD_SIZES)[number];

/** Elevated-surface shadow (drop + inner highlight) shared by Card's elevated variants. */
export const CARD_SHADOW = cn(
  "shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.04),inset_2px_-2px_7px_0px_rgba(0,0,0,0.01),inset_0px_4px_4px_0px_rgba(255,255,255,0.08)]",
  "dark:shadow-none"
);

const interactiveClasses = cn(
  "cursor-pointer",
  "transition-[background-color] duration-100 ease-out motion-reduce:transition-none",
  "hover:bg-primary-100 hover:shadow-none",
  "active:bg-primary-150 active:shadow-none",
  "disabled:text-primary-muted",
  "disabled:border-border",
  "disabled:pointer-events-none"
);

const cardVariants = cva(
  cn(
    "flex text-left group",
    "border border-border overflow-hidden",
    "text-foreground"
  ),
  {
    variants: {
      variant: {
        primary: cn("bg-muted-background", "border-border", CARD_SHADOW),
        active: cn("bg-primary-100", "border-border"),
        highlight: cn("bg-highlight-50", "border-transparent", CARD_SHADOW),
        warning: cn("bg-warning-50", "border-transparent", CARD_SHADOW),
        secondary: cn("bg-background", "border-border", CARD_SHADOW),
        tertiary: cn("bg-background", "border-transparent"),
      },
      size: {
        xs: "px-2 py-1.5 rounded-lg",
        sm: "p-3 rounded-2xl",
        md: "p-4 rounded-2xl",
        lg: "p-5 rounded-3xl",
      },
      selected: {
        true: cn(
          "border-highlight-300",
          "ring-2 ring-highlight-200/70",
          "shadow-sm"
        ),
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      selected: false,
    },
  }
);

interface CommonProps {
  variant?: CardVariantType;
  size?: CardSizeType;
  className?: string;
  /** Visually highlight the card as selected (ring + border). */
  selected?: boolean;
  /** Pulse the card's ring to draw attention; use for one element at a time. */
  isPulsing?: boolean;
  style?: React.CSSProperties;
}

interface CardLinkProps extends CommonProps, LinkWrapperProps {
  onClick?: never;
}

interface CardButtonProps
  extends CommonProps,
    React.ButtonHTMLAttributes<HTMLDivElement> {
  href?: never;
  target?: never;
  rel?: never;
  replace?: never;
  shallow?: never;
}

type InnerCardProps = CardLinkProps | CardButtonProps;

const InnerCard = React.forwardRef<HTMLDivElement, InnerCardProps>(
  (
    {
      children,
      variant,
      size,
      className,
      onClick,
      href,
      target = "_blank",
      rel = "",
      replace,
      shallow,
      selected,
      isPulsing,
      style,
      ...props
    },
    ref
  ) => {
    const { components } = React.useContext(SparkleContext);
    const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

    // Determine if the card is interactive based on href or onClick
    const isInteractive = Boolean(href || onClick);
    const isSelected = Boolean(selected);
    const hasSelectionProp = typeof selected !== "undefined";

    const cardButtonClassNames = cn(
      cardVariants({ variant, size, selected: isSelected }),
      // Apply interactive styles when either href or onClick is present
      isInteractive ? interactiveClasses : "",
      isPulsing && "animate-ring-pulse overflow-visible",
      className
    );

    const cardStyle = isPulsing ? { animationDuration: "3s", ...style } : style;

    if (href) {
      const linkContent = (
        <Link
          href={href}
          className={isPulsing ? "block h-full w-full" : cardButtonClassNames}
          replace={replace}
          shallow={shallow}
          target={target}
          rel={rel}
          aria-selected={hasSelectionProp ? isSelected : undefined}
        >
          {children}
        </Link>
      );
      if (isPulsing) {
        return (
          <div className={cardButtonClassNames} style={cardStyle}>
            {linkContent}
          </div>
        );
      }
      return linkContent;
    }

    return (
      <div
        ref={ref}
        className={cardButtonClassNames}
        style={cardStyle}
        onClick={onClick}
        role={isInteractive ? "button" : undefined}
        aria-pressed={
          isInteractive && hasSelectionProp ? isSelected : undefined
        }
        aria-selected={hasSelectionProp ? isSelected : undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

interface CardPropsBase {
  /** Secondary control (e.g. a CardActionButton) revealed on hover in the top-right corner. */
  action?: React.ReactNode;
  /** Class applied to the outer wrapper div around the card surface. */
  containerClassName?: string;
  className?: string;
  /** Visual style of the card surface. */
  variant?: CardVariantType;
  /** Padding and corner radius scale. */
  size?: CardSizeType;
}

interface CardPropsWithLink
  extends CardPropsBase,
    Omit<CardLinkProps, keyof CardPropsBase> {
  href: string;
  onClick?: never;
}

interface CardPropsWithButton
  extends CardPropsBase,
    Omit<CardButtonProps, keyof CardPropsBase> {
  href?: never;
}

InnerCard.displayName = "InnerCard";

export type CardProps = CardPropsWithLink | CardPropsWithButton;

/**
 * A container that groups related content onto a single, optionally interactive
 * surface (clickable via `onClick` or `href`), with variants, sizes, selected and
 * disabled states, a pulsing attention state, and an `action` slot. Use it for
 * selectable options or entry points (tools, data sources, agents), laid out with
 * CardGrid; when a card represents a single action, make the whole card clickable
 * rather than nesting a button.
 * @summary Grouping surface, optionally interactive.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ containerClassName, className, action, ...props }, ref) => {
    return (
      <div className={cn("group/card relative", containerClassName)} ref={ref}>
        <InnerCard className={cn("h-full w-full", className)} {...props} />
        {action && <CardActions>{action}</CardActions>}
      </div>
    );
  }
);
Card.displayName = "Card";

const CardActions = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & {
    children: React.ReactNode;
  }
>(({ children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-2 top-2 transition-opacity sm:opacity-0",
        "group-focus-within/card:opacity-100 group-hover/card:opacity-100"
      )}
      {...props}
    >
      {children}
    </div>
  );
});

CardActions.displayName = "CardActions";

/**
 * An icon-only button (default: close) styled for a Card's `action` slot,
 * revealed when the card is hovered or focused.
 * @summary Hover-revealed card action button.
 */
export const CardActionButton = React.forwardRef<
  HTMLButtonElement,
  IconOnlyButtonProps
>(({ className, variant = "outline", icon = XClose, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant={variant}
      icon={icon}
      className={className}
      {...props}
    />
  );
});

CardActionButton.displayName = "CardActionButton";

const uncappedGridClasses = cn(
  "@xxs:grid-cols-2",
  "@sm:grid-cols-3",
  "@lg:grid-cols-4",
  "@xl:grid-cols-5"
);

const adaptiveGridClasses = cn(
  "@xxs:has-[>:nth-child(2)]:grid-cols-2",
  "@sm:has-[>:nth-child(3)]:grid-cols-3",
  "@lg:has-[>:nth-child(4)]:grid-cols-4",
  "@xl:has-[>:nth-child(5)]:grid-cols-5"
);

interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Cap the column count to the number of children instead of the container width alone. */
  adaptColumns?: boolean;
  /** Override the inner grid's classes entirely. */
  gridClassName?: string;
}

/**
 * A responsive, container-query-driven grid for laying out Cards (1 to 5 columns
 * depending on available width).
 * @summary Responsive grid of cards.
 */
export const CardGrid = React.forwardRef<HTMLDivElement, CardGridProps>(
  (
    { children, className, gridClassName, adaptColumns = false, ...props },
    ref
  ) => {
    return (
      <div ref={ref} className={cn("@container", className)} {...props}>
        <div
          className={cn(
            "grid grid-cols-1 gap-2",
            gridClassName ??
              (adaptColumns ? adaptiveGridClasses : uncappedGridClasses)
          )}
        >
          {children}
        </div>
      </div>
    );
  }
);
CardGrid.displayName = "CardGrid";
