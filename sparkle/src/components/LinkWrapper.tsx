import { SparkleContext } from "@sparkle/context";
import React from "react";

export interface LinkWrapperProps {
  children: React.ReactNode;
  /** Destination URL; when omitted, children are rendered without any link wrapper. */
  href?: string;
  rel?: string;
  /** Replaces the current history entry instead of pushing a new one (router links). */
  replace?: boolean;
  /** Updates the URL without re-running data fetching (Next.js router links). */
  shallow?: boolean;
  target?: string;
  /** Hints the router to prefetch the destination (router links). */
  prefetch?: boolean;
  className?: string;
  tabIndex?: number;
}

/**
 * Wraps children in the host application's link component provided via
 * SparkleContext (e.g. next/link) when `href` is set, and renders children
 * as-is otherwise. Use it inside Sparkle components that can act as links so
 * consuming apps get client-side navigation.
 *
 * @summary Context-aware link wrapper.
 */
export const LinkWrapper = React.forwardRef<
  HTMLAnchorElement,
  LinkWrapperProps & { [key: `data-${string}`]: string | undefined }
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
      tabIndex,
      ...rest
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
          className={className}
          tabIndex={tabIndex}
          {...rest}
        >
          {children}
        </components.link>
      );
    }

    return children;
  }
);
