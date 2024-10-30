import React from "react";

import { SparkleContext } from "@sparkle/context";

export interface LinkWrapperProps {
  children: React.ReactNode;
  href?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
}

export function LinkWrapper({
  children,
  href,
  rel,
  replace,
  shallow,
  target,
}: LinkWrapperProps) {
  const { components } = React.useContext(SparkleContext);

  if (href) {
    return (
      <components.link
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
      >
        {children}
      </components.link>
    );
  }

  return children;
}
