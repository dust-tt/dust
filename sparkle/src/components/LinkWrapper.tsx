import React from "react";

import { SparkleContext } from "@sparkle/context";

export interface LinkWrapperProps {
  children: React.ReactNode;
  href: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
  prefetch?: boolean;
  disabled?: boolean;
}

export const LinkWrapper = React.forwardRef<
  HTMLAnchorElement,
  LinkWrapperProps
>(
  (
    { children, href, rel, replace, shallow, target, prefetch, disabled },
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
          disabled={disabled}
        >
          {children}
        </components.link>
      );
    }

    return children;
  }
);
