import React, { ComponentType, MouseEvent, ReactNode } from "react";

export type SparkleContextLinkType = ComponentType<{
  href: string;
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
}) => (
  <a
    href={href}
    className={className}
    aria-current={ariaCurrent}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    {children}
  </a>
);

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
