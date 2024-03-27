import React, { ComponentType, MouseEvent, ReactNode } from "react";
import type { UrlObject } from "url";
import url from "url";

export type SparkleContextLinkType = ComponentType<{
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
}>;

export type SparkleContextType = {
  components: {
    link: SparkleContextLinkType;
  };
};

export const aLink: SparkleContextLinkType = ({
  href,
  className,
  ariaCurrent,
  ariaLabel,
  onClick,
  children,
  target,
  rel,
}) => {
  const hrefAsString = typeof href !== "string" ? url.format(href) : href;

  return (
    <a
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
};

export const noHrefLink: SparkleContextLinkType = ({
  className,
  ariaCurrent,
  ariaLabel,
  onClick,
  children,
}) => (
  <a
    className={className}
    aria-current={ariaCurrent}
    arria-label={ariaLabel}
    onClick={onClick}
  >
    {children}
  </a>
);

export const SparkleContext = React.createContext<SparkleContextType>({
  components: {
    link: aLink,
  },
});
