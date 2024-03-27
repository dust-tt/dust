import React, { ReactNode } from "react";
import type { UrlObject } from "url";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { classNames } from "@sparkle/lib/utils";

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
    "s-bg-structure-100 s-border s-border-structure-200 hover:s-bg-structure-50 hover:s-border-structure-100 active:s-bg-structure-200 active:s-border-structure-300",
  secondary:
    "s-bg-structure-0 s-border s-border-structure-100 hover:s-bg-structure-100 hover:s-border-structure-200 active:s-bg-structure-200 active:s-border-structure-300",
  tertiary:
    "s-border-structure-100/0 s-border s-border-structure-0 hover:s-bg-structure-50 hover:s-border-structure-100 active:s-bg-structure-100 active:s-border-structure-200",
};

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

  const commonClasses = classNames(
    "s-flex s-cursor-pointer s-transition s-duration-200",
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
