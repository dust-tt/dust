import classNames from "classnames";
import React, { ReactElement, ReactNode } from "react";

const defaultGridClasses = "grid grid-cols-12 gap-10";

export const Grid = ({
  children,
  colorCSS = "text-slate-50",
  className = "",
}: ContentProps) => (
  <div className={classNames(className, colorCSS, defaultGridClasses)}>
    {children}
  </div>
);

const hClasses = {
  h1: "font-objektiv text-4xl font-bold tracking-tight md:text-6xl drop-shadow-lg",
  h2: "font-objektiv text-3xl font-bold tracking-tight md:text-5xl drop-shadow-lg",
  h3: "font-objektiv text-xl font-bold tracking-tight md:text-3xl drop-shadow-md",
  h4: "font-objektiv text-lg font-bold tracking-tight md:text-2xl drop-shadow-md",
};

interface ContentProps {
  children: ReactNode;
  className?: string;
  colorCSS?: string;
}

type TagName = "h1" | "h2" | "h3" | "h4";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<ContentProps> = ({
    children,
    colorCSS = "text-slate-50",
    className = "",
  }) => {
    return (
      <Tag className={classNames(className, colorCSS, hClasses[Tag])}>
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

export const Span = ({ children, colorCSS, className = "" }: ContentProps) => (
  <span className={classNames(className, colorCSS)}>{children}</span>
);

const borderColorTable = {
  pink: "border-pink-300",
  amber: "border-amber-400",
  sky: "border-sky-400",
  emerald: "border-emerald-400",
  red: "border-red-400",
};

const pClasses = {
  xs: "font-regular text-sm text-slate-400 md:text-base",
  sm: "font-regular text-base text-slate-400 md:text-lg",
  md: "font-regular text-lg text-slate-400 md:text-xl drop-shadow",
  lg: "font-regular text-xl text-slate-400 md:text-2xl drop-shadow",
};

interface PProps {
  children: ReactNode;
  className?: string;
  variant?: "xs" | "sm" | "md" | "lg";
  border?: "pink" | "amber" | "emerald" | "sky" | "red";
}

export const P = ({
  children,
  border,
  className = "",
  variant = "md",
}: PProps) => (
  <p
    className={classNames(
      className,
      border ? "border-l-4 pl-4" : "",
      border ? borderColorTable[border] : "",
      pClasses[variant]
    )}
  >
    {children}
  </p>
);

const aClasses = {
  primary: "text-action-400 hover:text-action-400 active:text-action-600",
  secondary: "text-slate-200 hover:text-slate-100 active:text-slate-500",
  tertiary: "text-slate-400 hover:text-slate-100 active:text-slate-500",
};

interface AProps {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "tertiary";
}

export const A = ({
  children,
  variant = "primary",
  className = "",
}: AProps) => (
  <a
    className={classNames(
      className,
      "font-semibold transition-all duration-300 ease-out hover:underline hover:underline-offset-4",
      aClasses[variant]
    )}
  >
    {children}
  </a>
);

export const Strong = ({ children, className = "" }: ContentProps) => (
  <strong className={classNames(className, "font-medium text-slate-200")}>
    {children}
  </strong>
);

interface ReactImgProps {
  children: ReactNode;
  colorCSS?: string;
  colorHEX?: string;
  paddingCSS?: string;
  className?: string;
  src?: string;
  isSmall?: boolean;
}

export const ReactiveImg = ({
  children,
  colorCSS = "border-slate-700/40 bg-slate-900/30",
  colorHEX,
  paddingCSS = "p-3",
  className = "",
  isSmall = false,
}: ReactImgProps) => {
  const singleChild = React.Children.only(children);

  if (!React.isValidElement(singleChild)) {
    console.error(
      "Invalid children for ReactiveImg. It must be a single React element."
    );
    return null;
  }

  const modifiedChild = React.cloneElement(singleChild as ReactElement, {
    className: classNames(
      singleChild.props.className,
      "z-10",
      !isSmall
        ? "scale-100 transition-all duration-700 ease-out group-hover:scale-105"
        : "scale-100 transition-all duration-500 ease-out group-hover:scale-125"
    ),
  });

  const style = colorHEX
    ? {
        backgroundColor: `${colorHEX}88`, // B3 is hexadecimal for 70% opacity
        borderColor: "#FFFFFF22", // 33 is hexadecimal for 20% opacity
      }
    : undefined;

  return (
    <div className={classNames("group", className)}>
      <div
        style={style}
        className={classNames(
          colorCSS,
          paddingCSS,
          "flex rounded-2xl border drop-shadow-[0_25px_25px_rgba(0,0,0,0.5)] backdrop-blur-sm",
          !isSmall
            ? "scale-100 transition-all duration-700 ease-out group-hover:scale-105"
            : "scale-100 transition-all duration-500 ease-out group-hover:scale-110"
        )}
      >
        {modifiedChild}
      </div>
    </div>
  );
};

export const ReactiveIcon = ({ children, colorHEX }: ReactImgProps) => {
  const singleChild = React.Children.only(children);

  if (!React.isValidElement(singleChild)) {
    console.error(
      "Invalid children for ReactiveIcon. It must be a single React element."
    );
    return null;
  }

  const modifiedChild = React.cloneElement(
    singleChild as React.ReactElement<any, any>,
    {
      className: classNames(
        singleChild.props.className,
        "h-12 w-12 drop-shadow-[0_5px_5px_rgba(0,0,0,0.4)]"
      ),
    }
  );
  return (
    <ReactiveImg colorHEX={colorHEX} className="w-fit" paddingCSS="p-4" isSmall>
      {modifiedChild}
    </ReactiveImg>
  );
};
