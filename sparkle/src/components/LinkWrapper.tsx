import React from "react";

import { SparkleContext } from "@sparkle/context";

export interface LinkWrapperProps {
  children: React.ReactNode;
  href?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
  prefetch?: boolean;
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
      className,
      style,
    },
    ref
  ) => {
    const { components } = React.useContext(SparkleContext);

    if (components && href) {
      return (
        <components.link
          ref={ref}
          href={href}
          target={target}
          rel={rel}
          replace={replace}
          shallow={shallow}
          prefetch={prefetch}
          className={className}
          style={style}
        >
          {children}
        </components.link>
      );
    }

    return children;
  }
);
