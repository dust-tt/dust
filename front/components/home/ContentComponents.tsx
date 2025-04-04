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
  h1: "heading-5xl md:heading-6xl lg:heading-8xl py-2 text-left",
  h2: "heading-3xl lg:heading-4xl xl:heading-5xl py-2 text-left",
  h3: "heading-xl lg:heading-2xl xl:heading-3xl py-1 text-left",
  h4: "heading-lg lg:heading-xl xl:heading-2xl text-left",
  h5: "heading-lg lg:heading-xl xl:heading-xl text-left",
};

interface ContentProps {
  children: ReactNode;
  verticalAlign?: "top" | "center" | "bottom";
  gap?: string;
  className?: string;
}

interface HContentProps {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}

type TagName = "h1" | "h2" | "h3" | "h4" | "h5";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<HContentProps> = ({
    children,
    className = "",
    mono = false,
  }) => {
    const baseClasses = mono
      ? classNames(
          hClasses[Tag].replace(/heading-/g, "heading-mono-"),
          "font-mono"
        )
      : classNames(hClasses[Tag], "font-sans");
    return <Tag className={classNames(className, baseClasses)}>{children}</Tag>;
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
  <span className={classNames(className, "font-sans")}>{children}</span>
);

const pClasses = {
  xxs: "copy-xs",
  xs: "copy-sm",
  sm: "copy-base",
  md: "copy-lg",
  lg: "copy-xl",
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
      <div
        className={classNames("flex gap-2 lg:gap-3", className, "font-sans")}
      >
        <Icon
          visual={shapeClasses[shape]}
          className={classNames("mt-0.5 shrink-0", dotCSS)}
          size="md"
        />
        <p className={classNames(pClasses[size], "font-sans")}>{children}</p>
      </div>
    );
  } else {
    return (
      <p className={classNames(pClasses[size], className, "font-sans")}>
        {children}
      </p>
    );
  }
};

const aClasses = {
  primary: "text-highlight hover:text-highlight active:text-highlight-400",
  secondary:
    "text-foreground hover:text-primary-800 active:text-muted-foreground",
  tertiary:
    "text-muted-foreground hover:text-primary-500 active:text-muted-foreground",
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
          aClasses[variant],
          "font-sans"
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
          aClasses[variant],
          "font-sans"
        )}
      >
        {children}
      </span>
    );
  }
};

export const Strong = ({ children, className = "" }: ContentProps) => (
  <strong className={classNames(className, "font-sans font-semibold")}>
    {children}
  </strong>
);
