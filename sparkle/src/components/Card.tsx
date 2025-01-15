import { cva } from "class-variance-authority";
import React from "react";

import { Button, MiniButtonProps } from "@sparkle/components/Button";
import { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

export const CARD_VARIANTS = ["primary", "secondary", "tertiary"] as const;

export type CardVariantType = (typeof CARD_VARIANTS)[number];

const variantClasses: Record<CardVariantType, string> = {
  primary: "s-bg-primary-50 s-border-border-dark/0",
  secondary: "s-bg-background s-border-border-dark",
  tertiary: "s-bg-background s-border-border-dark/0",
};

export const CARD_VARIANTS_SIZES = ["sm", "md", "lg"] as const;

export type CardSizeType = (typeof CARD_VARIANTS_SIZES)[number];

const sizeVariants: Record<CardSizeType, string> = {
  sm: "s-p-3 s-rounded-xl",
  md: "s-p-4 s-rounded-2xl",
  lg: "s-p-5 s-rounded-3xl",
};

const cardVariants = cva(
  "s-flex s-text-left s-group s-border s-overflow-hidden s-text-foreground",
  {
    variants: {
      variant: variantClasses,
      size: sizeVariants,
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface CommonProps {
  variant?: CardVariantType;
  size?: CardSizeType;
  className?: string;
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
      ...props
    },
    ref
  ) => {
    const { components } = React.useContext(SparkleContext);
    const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

    // Determine if the card is interactive based on href or onClick
    const isInteractive = Boolean(href || onClick);

    const cardButtonClassNames = cn(
      cardVariants({ variant, size }),
      // Apply interactive styles when either href or onClick is present
      isInteractive &&
        "s-cursor-pointer disabled:s-text-primary-muted disabled:s-border-structure-100 disabled:s-pointer-events-none s-transition s-duration-200 hover:s-bg-primary-100 active:s-bg-primary-200",
      className
    );

    if (href) {
      return (
        <Link
          href={href}
          className={cardButtonClassNames}
          replace={replace}
          shallow={shallow}
          target={target}
          rel={rel}
        >
          {children}
        </Link>
      );
    }

    return (
      <div
        ref={ref}
        className={cardButtonClassNames}
        onClick={onClick}
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

export type CardProps = CardPropsWithLink | CardPropsWithButton;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ containerClassName, className, action, ...props }, ref) => {
    return (
      <div
        className={cn("s-group/card s-relative", containerClassName)}
        ref={ref}
      >
        <InnerCard className={cn("s-h-full s-w-full", className)} {...props} />
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
        "s-absolute s-right-2 s-top-2 s-opacity-0 s-transition-opacity",
        "s-opacity-0 group-focus-within/card:s-opacity-100 group-hover/card:s-opacity-100"
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
  MiniButtonProps
>(({ className, variant = "outline", icon = XMarkIcon, ...props }, ref) => {
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

export const CardGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div ref={ref} className={cn("s-@container", className)} {...props}>
      <div
        className={cn(
          "s-grid s-grid-cols-1 s-gap-2",
          "@xs:s-grid-cols-2 @sm:s-grid-cols-3 @lg:s-grid-cols-4 @xl:s-grid-cols-5"
        )}
      >
        {children}
      </div>
    </div>
  );
});
CardGrid.displayName = "CardGrid";
