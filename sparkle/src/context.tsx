import React, { ComponentType, MouseEvent, ReactNode } from "react";

export type SparkleContextLinkType = ComponentType<{
  key?: React.Key | null;
  href: string;
  className?: string;
  children: ReactNode;
  arriaCurrent?:
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
  key,
  href,
  className,
  arriaCurrent,
  children,
}) => (
  <a key={key} href={href} className={className} aria-current={arriaCurrent}>
    {children}
  </a>
);

export const divLink: SparkleContextLinkType = ({
  key,
  className,
  arriaCurrent,
  children,
}) => (
  <div key={key} className={className} aria-current={arriaCurrent}>
    {children}
  </div>
);

export const SparkleContext = React.createContext<SparkleContextType>({
  components: {
    link: ({ key, href, className, arriaCurrent, children }) => (
      <a
        key={key}
        href={href}
        className={className}
        aria-current={arriaCurrent}
      >
        {children}
      </a>
    ),
  },
});
