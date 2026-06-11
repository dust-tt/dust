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

const interactiveClasses = cn(
  "s:cursor-pointer",
  "s:transition s:duration-200",
  "s:hover:bg-primary-100 s:dark:hover:bg-primary-100-night",
  "s:active:bg-primary-150 s:dark:active:bg-primary-150-night",
  "s:disabled:text-primary-muted s:dark:disabled:text-primary-muted-night",
  "s:disabled:border-border s:dark:disabled:border-border-night",
  "s:disabled:pointer-events-none"
);

const cardVariants = cva(
  cn(
    "s:flex s:text-left s:group",
    "s:border s:overflow-hidden",
    "s:text-foreground s:dark:text-foreground-night"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "s:bg-muted-background",
          "s:border-border/0",
          "s:dark:bg-muted-background-night",
          "s:dark:border-border-night/0"
        ),
        active: cn(
          "s:bg-muted-background",
          "s:border-border",
          "s:dark:bg-muted-background-night",
          "s:dark:border-border-night"
        ),
        highlight: cn(
          "s:bg-highlight-50",
          "s:border-border/0",
          "s:dark:bg-highlight-100-night",
          "s:dark:border-border-night/0"
        ),
        warning: cn(
          "s:bg-warning-50",
          "s:border-border/0",
          "s:dark:bg-warning-50-night",
          "s:dark:border-border-night/0"
        ),
        secondary: cn(
          "s:bg-background",
          "s:border-border",
          "s:dark:bg-background-night",
          "s:dark:border-border-night"
        ),
        tertiary: cn(
          "s:bg-background",
          "s:border-border/0",
          "s:dark:bg-background-night",
          "s:dark:border-border-night/0"
        ),
      },
      size: {
        xs: "s:px-2 s:py-1.5 s:rounded-lg",
        sm: "s:p-3 s:rounded-xl",
        md: "s:p-4 s:rounded-2xl",
        lg: "s:p-5 s:rounded-3xl",
      },
      selected: {
        true: cn(
          "s:border-highlight-300 s:dark:border-highlight-300-night",
          "s:ring-2 s:ring-highlight-200/70 s:dark:ring-highlight-300/60",
          "s:shadow-sm"
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
  selected?: boolean;
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
      isPulsing && "s:animate-ring-pulse s:overflow-visible",
      className
    );

    const cardStyle = isPulsing ? { animationDuration: "3s", ...style } : style;

    if (href) {
      const linkContent = (
        <Link
          href={href}
          className={
            isPulsing ? "s:block s:h-full s:w-full" : cardButtonClassNames
          }
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
  action?: React.ReactNode;
  containerClassName?: string;
  className?: string;
  variant?: CardVariantType;
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

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ containerClassName, className, action, ...props }, ref) => {
    return (
      <div
        className={cn("s:group/card s:relative", containerClassName)}
        ref={ref}
      >
        <InnerCard className={cn("s:h-full s:w-full", className)} {...props} />
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
        "s:absolute s:right-2 s:top-2 s:transition-opacity s:sm:opacity-0",
        "s:group-focus-within/card:opacity-100 s:group-hover/card:opacity-100"
      )}
      {...props}
    >
      {children}
    </div>
  );
});

CardActions.displayName = "CardActions";

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
  "s:@xxs:grid-cols-2",
  "s:@sm:grid-cols-3",
  "s:@lg:grid-cols-4",
  "s:@xl:grid-cols-5"
);

const adaptiveGridClasses = cn(
  "s:@xxs:has-[>:nth-child(2)]:grid-cols-2",
  "s:@sm:has-[>:nth-child(3)]:grid-cols-3",
  "s:@lg:has-[>:nth-child(4)]:grid-cols-4",
  "s:@xl:has-[>:nth-child(5)]:grid-cols-5"
);

interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  adaptColumns?: boolean;
  gridClassName?: string;
}

export const CardGrid = React.forwardRef<HTMLDivElement, CardGridProps>(
  (
    { children, className, gridClassName, adaptColumns = false, ...props },
    ref
  ) => {
    return (
      <div ref={ref} className={cn("s:@container", className)} {...props}>
        <div
          className={cn(
            "s:grid s:grid-cols-1 s:gap-2",
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
