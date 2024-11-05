import { cva, VariantProps } from "class-variance-authority";
import React, { ReactNode } from "react";
import type { UrlObject } from "url";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";

const CARD_BUTTON_VARIANTS = ["primary", "secondary", "tertiary"] as const;

type CardButtonVariantType = (typeof CARD_BUTTON_VARIANTS)[number];

const CARD_BUTTON_SIZES = ["sm", "md", "lg"] as const;

type CardButtonSizeType = (typeof CARD_BUTTON_SIZES)[number];

const variantClasses: Record<CardButtonVariantType, string> = {
  primary:
    "s-bg-structure-50 s-border s-border-structure-200 hover:s-bg-white hover:s-border-structure-100 active:s-bg-structure-100 active:s-border-structure-200 s-cursor-pointer",
  secondary:
    "s-bg-structure-0 s-border s-border-structure-100 hover:s-bg-structure-50 hover:s-border-structure-200 active:s-bg-structure-100 active:s-border-structure-300 s-cursor-pointer",
  tertiary:
    "s-border-structure-100/0 s-border s-border-structure-0 hover:s-bg-structure-50 hover:s-border-structure-100 active:s-bg-structure-100 active:s-border-structure-200 s-cursor-pointer",
};

const sizeVariants: Record<CardButtonSizeType, string> = {
  sm: "s-p-3 s-rounded-xl",
  md: "s-p-4 s-rounded-2xl",
  lg: "s-p-5 s-rounded-3xl",
};

interface CardButtonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardButtonVariants> {
  children: ReactNode;
  href?: string | UrlObject;
  target?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
}

const cardButtonVariants = cva(
  "s-flex s-group s-transition s-duration-200 s-overflow-hidden",
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
}: CardButtonProps) {
  const { components } = React.useContext(SparkleContext);
  const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

  if (href) {
    return (
      <Link
        href={href}
        className={cardButtonVariants({ variant, size, className })}
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
      className={cardButtonVariants({ variant, size, className })}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
