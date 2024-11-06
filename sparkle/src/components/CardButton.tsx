import { cva, VariantProps } from "class-variance-authority";
import React, { ReactNode } from "react";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { cn } from "@sparkle/lib/utils";

const CARD_BUTTON_VARIANTS = ["primary", "secondary", "tertiary"] as const;

type CardButtonVariantType = (typeof CARD_BUTTON_VARIANTS)[number];

const variantClasses: Record<CardButtonVariantType, string> = {
  primary: "s-bg-structure-50 s-border-border-dark/0",
  secondary: "s-bg-background s-border-border-dark",
  tertiary: "s-bg-background s-border-border-dark/0",
};

const CARD_BUTTON_SIZES = ["sm", "md", "lg"] as const;

type CardButtonSizeType = (typeof CARD_BUTTON_SIZES)[number];

const sizeVariants: Record<CardButtonSizeType, string> = {
  sm: "s-p-3 s-rounded-xl",
  md: "s-p-4 s-rounded-2xl",
  lg: "s-p-5 s-rounded-3xl",
};

const cardButtonVariants = cva(
  "s-flex s-text-left s-group s-transition s-duration-200 s-border s-overflow-hidden s-text-foreground s-cursor-pointer hover:s-border-primary-100 hover:s-bg-primary-100 active:s-bg-primary-200 disabled:s-text-primary-muted disabled:s-border-structure-100 disabled:s-pointer-events-none",
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

interface CardButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof cardButtonVariants> {
  children: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
}

export function CardButton({
  children,
  variant,
  size,
  className,
  onClick,
  onMouseEnter,
  onMouseLeave,
  href,
  target = "_blank",
  rel = "",
  replace,
  shallow,
  ...props
}: CardButtonProps) {
  const { components } = React.useContext(SparkleContext);
  const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

  const cardButtonClassNames = cn(
    cardButtonVariants({ variant, size }),
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
    <button
      className={cardButtonClassNames}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...props}
    >
      {children}
    </button>
  );
}
