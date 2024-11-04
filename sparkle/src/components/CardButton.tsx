import React, { ReactNode } from "react";
import type { UrlObject } from "url";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { cn } from "@sparkle/lib/utils";

interface CardButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  href?: string | UrlObject;
  target?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
}

const variantClasses = {
  primary:
    "s-text-primary-dark s-bg-primary-50 s-border-muted-background s-border",
  secondary:
    "s-border s-text-primary-dark s-bg-background s-border-border-dark",
  tertiary: "s-border s-border-border-dark/0",
};

const hoverVariantClasses =
  "hover:s-bg-primary-100 hover:s-border-primary-100 active:s-bg-primary-300 disabled:s-text-primary-muted disabled:s-border-structure-100 s-cursor-pointer";

const sizeClasses = {
  sm: "s-p-3 s-rounded-xl",
  md: "s-p-4 s-rounded-2xl",
  lg: "s-p-5 s-rounded-3xl",
};

export function CardButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
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

  const commonClasses = cn(
    "s-flex s-group s-transition s-duration-200 s-overflow-hidden",
    onClick && hoverVariantClasses,
    variantClasses[variant],
    sizeClasses[size],
    className
  );
  if (href) {
    return (
      <Link
        href={href}
        className={commonClasses}
        replace={replace}
        shallow={shallow}
        target={target}
        rel={rel}
      >
        {children}
      </Link>
    );
  } else {
    return (
      <div
        className={commonClasses}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    );
  }
}
