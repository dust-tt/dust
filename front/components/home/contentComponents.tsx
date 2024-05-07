import {
  CircleIcon,
  HexagonIcon,
  Icon,
  RectangleIcon,
  SquareIcon,
  TriangleIcon,
} from "@dust-tt/sparkle";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import React from "react";

import { classNames } from "@app/lib/utils";

const verticalGridClasses = {
  top: "items-start",
  center: "items-center",
  bottom: "items-end",
};

export const Grid = ({
  children,
  verticalAlign = "top",
  className = "",
  gap = "sm:gap-8 md:gap-y-12",
}: ContentProps) => (
  <div
    className={classNames(
      className,
      "grid grid-cols-12",
      gap,
      verticalGridClasses[verticalAlign]
    )}
  >
    {children}
  </div>
);

const hClasses = {
  h1: "font-objektiv text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl py-2",
  h2: "font-objektiv text-3xl font-bold tracking-tight lg:text-4xl xl:text-5xl py-2",
  h3: "font-objektiv text-xl font-bold tracking-tight lg:text-2xl xl:text-3xl py-1",
  h4: "font-objektiv text-lg font-bold tracking-tight lg:text-xl xl:text-2xl",
  h5: "font-objektiv text-lg font-bold tracking-tight lg:text-xl xl:text-xl",
};

interface ContentProps {
  children: ReactNode;
  verticalAlign?: "top" | "center" | "bottom";
  gap?: string;
  className?: string;
}

interface HContentProps {
  children: ReactNode;
  className?: string;
  from?: string;
  to?: string;
}

type TagName = "h1" | "h2" | "h3" | "h4" | "h5";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<HContentProps> = ({
    children,
    from = "",
    to = "",
    className = "",
  }) => {
    return (
      <Tag
        className={classNames(
          className,
          hClasses[Tag],
          from ? "bg-gradient-to-br bg-clip-text text-transparent" : "",
          from,
          to
        )}
      >
        {children}
      </Tag>
    );
  };
  Component.displayName = Tag.toUpperCase();
  return Component;
};

export const H1 = createHeadingComponent("h1");
export const H2 = createHeadingComponent("h2");
export const H3 = createHeadingComponent("h3");
export const H4 = createHeadingComponent("h4");
export const H5 = createHeadingComponent("h5");

export const Span = ({ children, className = "" }: ContentProps) => (
  <span className={classNames(className)}>{children}</span>
);

const pClasses = {
  xxs: "font-objektiv text-xs text-slate-500 md:text-sm leading-relaxed",
  xs: "font-objektiv text-sm text-slate-400 md:text-base leading-relaxed",
  sm: "font-objektiv text-base text-slate-400 md:text-lg leading-relaxed",
  md: "font-objektiv text-lg md:text-lg text-slate-300 lg:text-xl leading-relaxed",
  lg: "font-objektiv text-lg md:text-xl text-slate-300 lg:text-2xl drop-shadow leading-relaxed",
};

interface PProps {
  children: ReactNode;
  className?: string;
  size?: "xxs" | "xs" | "sm" | "md" | "lg";
  dotCSS?: string;
  shape?: "square" | "circle" | "triangle" | "hexagon" | "rectangle";
}

const shapeClasses = {
  square: SquareIcon,
  circle: CircleIcon,
  triangle: TriangleIcon,
  hexagon: HexagonIcon,
  rectangle: RectangleIcon,
};

export const P = ({
  children,
  dotCSS = "",
  className = "",
  size = "md",
  shape = "square",
}: PProps) => {
  if (dotCSS) {
    return (
      <div className={classNames(className, "flex gap-2 lg:gap-3")}>
        <Icon
          visual={shapeClasses[shape]}
          className={classNames("mt-0.5 shrink-0", dotCSS)}
          size="md"
        />
        <p className={classNames(pClasses[size])}>{children}</p>
      </div>
    );
  } else {
    return <p className={classNames(className, pClasses[size])}>{children}</p>;
  }
};

const aClasses = {
  primary: "text-action-400 hover:text-action-400 active:text-action-600",
  secondary: "text-slate-200 hover:text-slate-100 active:text-slate-500",
  tertiary: "text-slate-400 hover:text-slate-100 active:text-slate-500",
};

interface AProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "tertiary";
}

export const A = ({
  children,
  variant = "primary",
  className = "",
  href,
  ...props
}: AProps) => {
  if (href) {
    return (
      <a
        {...props}
        className={classNames(
          className,
          "cursor-pointer font-semibold transition-all duration-300 ease-out hover:underline hover:underline-offset-4",
          aClasses[variant]
        )}
        href={href}
      >
        {children}
      </a>
    );
  } else {
    return (
      <span
        className={classNames(
          className,
          "cursor-pointer font-semibold transition-all duration-300 ease-out hover:underline hover:underline-offset-4",
          aClasses[variant]
        )}
      >
        {children}
      </span>
    );
  }
};

export const Strong = ({ children, className = "" }: ContentProps) => (
  <strong className={classNames(className, "font-semibold")}>{children}</strong>
);
