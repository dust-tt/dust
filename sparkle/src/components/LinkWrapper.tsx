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
}

export const LinkWrapper = React.forwardRef<
  HTMLAnchorElement,
  LinkWrapperProps
>(
  (
    { children, href, rel, replace, shallow, target, prefetch, className },
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
          className={className}
        >
          {children}
        </components.link>
      );
    }

    return children;
  }
);
