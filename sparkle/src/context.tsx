import React, {
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { UrlObject } from "url";
import url from "url";

export type SparkleLinkProps = {
  href: string | UrlObject;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?:
    | boolean
    | "time"
    | "false"
    | "true"
    | "page"
    | "step"
    | "location"
    | "date";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
  rel?: string;
  prefetch?: boolean;
  tabIndex?: number;
};

export type SparkleContextLinkType = ComponentType<
  SparkleLinkProps & React.RefAttributes<HTMLAnchorElement>
>;

export type SparkleContextType = {
  components: {
    link: SparkleContextLinkType;
  };
};

export const aLink: SparkleContextLinkType = React.forwardRef<
  HTMLAnchorElement,
  SparkleLinkProps
>(({ href, children, ...props }, ref) => {
  const hrefAsString = typeof href !== "string" ? url.format(href) : href;

  return (
    <a ref={ref} href={hrefAsString} {...props}>
      {children}
    </a>
  );
});

export const noHrefLink: SparkleContextLinkType = React.forwardRef<
  HTMLAnchorElement,
  SparkleLinkProps
>(
  (
    {
      className,
      "aria-current": ariaCurrent,
      "aria-label": ariaLabel,
      onClick,
      children,
    },
    ref
  ) => (
    <a
      ref={ref}
      className={className}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </a>
  )
);

export const SparkleContext = React.createContext<SparkleContextType>({
  components: {
    link: aLink,
  },
});
