import React from "react";

import { SparkleContext } from "@sparkle/context";
import { cn } from "@sparkle/lib";

export interface LinkWrapperProps {
  children: React.ReactNode;
  href?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
  prefetch?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  ariaCurrent?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const LinkWrapper = React.forwardRef<
  HTMLAnchorElement,
  LinkWrapperProps
>(
  (
    {
      children,
      href,
      rel,
      replace,
      shallow,
      target,
      prefetch,
      disabled,
      ariaLabel,
      ariaCurrent,
      className,
      style,
    },
    ref
  ) => {
    const { components } = React.useContext(SparkleContext);

    if (href) {
      return (
        <components.link
          ref={ref}
          href={href}
          target={target}
          rel={rel}
          replace={replace}
          shallow={shallow}
          prefetch={prefetch}
          className={cn(className, disabled && "s-pointer-events-none")}
          aria-label={ariaLabel}
          aria-current={ariaCurrent}
          style={style}
        >
          {children}
        </components.link>
      );
    }

    return children;
  }
);
