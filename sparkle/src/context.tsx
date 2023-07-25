import React, { ComponentType, MouseEvent, ReactNode } from "react";

export type SparkleContextType = {
  components: {
    link: ComponentType<{
      href?: string;
      className?: string;
      children: ReactNode;
      onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
    }>;
  };
};

export const SparkleContext = React.createContext<SparkleContextType>({
  components: {
    link: ({ href, className, children }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ),
  },
});
