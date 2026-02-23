import type { SparkleLinkProps } from "@dust-tt/sparkle";
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import url from "url";

// Link wrapper that uses React Router's Link for SPA navigation
export const ReactRouterLinkWrapper = forwardRef<
  HTMLAnchorElement,
  SparkleLinkProps
>(function ReactRouterLinkWrapper(
  { href, children, shallow: _shallow, replace, prefetch: _prefetch, ...props },
  ref
) {
  // Convert UrlObject to string if needed
  const hrefString = typeof href !== "string" ? url.format(href) : href;

  // For external links or API routes, use regular anchor
  if (
    hrefString.startsWith("http://") ||
    hrefString.startsWith("https://") ||
    hrefString.startsWith("/api/")
  ) {
    return (
      <a ref={ref} href={hrefString} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link ref={ref} to={hrefString} replace={replace} {...props}>
      {children}
    </Link>
  );
});
