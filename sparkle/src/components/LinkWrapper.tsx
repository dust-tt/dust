import React from "react";

import { SparkleContext } from "@sparkle/context";

export interface LinkWrapperProps {
  href?: string;
  target?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function LinkWrapper({
  href,
  target,
  rel,
  replace,
  shallow,
  className,
  children,
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
        className={className}
      >
        {children}
      </components.link>
    );
  }

  return <>{children}</>;
}
