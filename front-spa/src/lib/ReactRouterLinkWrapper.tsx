import type { MouseEvent, ReactNode } from "react";
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import type { UrlObject } from "url";
import url from "url";

// Link wrapper that uses React Router's Link for SPA navigation
export const ReactRouterLinkWrapper = forwardRef<
  HTMLAnchorElement,
  {
    href: string | UrlObject;
    className?: string;
    children: ReactNode;
    ariaLabel?: string;
    ariaCurrent?:
      | boolean
      | "time"
      | "false"
      | "true"
      | "page"
      | "step"
      | "location"
      | "date";
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
    target?: string;
    rel?: string;
  }
>(function ReactRouterLinkWrapper(
  {
    href,
    className,
    children,
    ariaCurrent,
    ariaLabel,
    onClick,
    target = "_self",
    rel,
  },
  ref
) {
  // Convert UrlObject to string if needed
  const hrefString = typeof href !== "string" ? url.format(href) : href;

  // For external links or API routes, use regular anchor
  if (hrefString.startsWith("http") || hrefString.startsWith("/api/")) {
    return (
      <a
        ref={ref}
        href={hrefString}
        className={className}
        onClick={onClick}
        aria-current={ariaCurrent}
        aria-label={ariaLabel}
        target={target}
        rel={rel}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      ref={ref}
      to={hrefString}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      target={target}
      rel={rel}
    >
      {children}
    </Link>
  );
});
