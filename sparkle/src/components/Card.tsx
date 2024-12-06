import { cva } from "class-variance-authority";
import React, { ReactNode } from "react";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { cn } from "@sparkle/lib/utils";

export const CARD_BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "tertiary",
] as const;

export type CardVariantType = (typeof CARD_BUTTON_VARIANTS)[number];

const variantClasses: Record<CardVariantType, string> = {
  primary: "s-bg-primary-50 s-border-border-dark/0",
  secondary: "s-bg-background s-border-border-dark",
  tertiary: "s-bg-background s-border-border-dark/0",
};

const CARD_BUTTON_SIZES = ["sm", "md", "lg"] as const;

type CardSizeType = (typeof CARD_BUTTON_SIZES)[number];

const sizeVariants: Record<CardSizeType, string> = {
  sm: "s-p-3 s-rounded-2xl",
  md: "s-p-4 s-rounded-3xl",
  lg: "s-p-5 s-rounded-[32px]",
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

interface LinkProps extends CommonProps {
  children?: ReactNode;
  href: string;
  target?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  onClick?: never;
  onMouseEnter?: never;
  onMouseLeave?: never;
}

interface ButtonProps
  extends CommonProps,
    React.ButtonHTMLAttributes<HTMLDivElement> {
  href?: never;
  target?: never;
  rel?: never;
  replace?: never;
  shallow?: never;
}

export type CardProps = LinkProps | ButtonProps;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
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

    const cardButtonClassNames = cn(
      cardVariants({ variant, size }),
      onClick &&
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

Card.displayName = "Card";
