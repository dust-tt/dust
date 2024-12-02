import React, { ComponentType, MouseEvent, ReactNode } from "react";
import type { UrlObject } from "url";
import url from "url";

type SparkleLinkProps = {
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
  replace?: boolean;
  shallow?: boolean;
  target?: string;
  rel?: string;
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
>(
  (
    { href, className, ariaCurrent, ariaLabel, onClick, children, target, rel },
    ref
  ) => {
    const hrefAsString = typeof href !== "string" ? url.format(href) : href;

    return (
      <a
        ref={ref}
        href={hrefAsString}
        className={className}
        aria-current={ariaCurrent}
        aria-label={ariaLabel}
        onClick={onClick}
        target={target}
        rel={rel}
      >
        {children}
      </a>
    );
  }
);

export const noHrefLink: SparkleContextLinkType = React.forwardRef<
  HTMLAnchorElement,
  SparkleLinkProps
>(({ className, ariaCurrent, ariaLabel, onClick, children }, ref) => (
  <a
    ref={ref}
    className={className}
    aria-current={ariaCurrent}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    {children}
  </a>
));

export const SparkleContext = React.createContext<SparkleContextType>({
  components: {
    link: aLink,
  },
});
