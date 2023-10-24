import classNames from "classnames";
import React, { ReactElement, ReactNode } from "react";

const defaultGridClasses = "grid grid-cols-12 gap-6";

export const Grid = ({
  children,
  color = "text-slate-50",
  className = "",
}: ContentProps) => (
  <div className={classNames(className, color, defaultGridClasses)}>
    {children}
  </div>
);

const hClasses = {
  h1: "font-objektiv text-4xl font-bold tracking-tight md:text-6xl drop-shadow-lg",
  h2: "font-objektiv text-3xl font-bold tracking-tight md:text-5xl drop-shadow-lg",
  h3: "font-objektiv text-xl font-bold tracking-tight md:text-2xl drop-shadow-md",
  h4: "font-objektiv text-lg font-bold tracking-tight md:text-xl drop-shadow-md",
};

const pClasses = {
  normal: "font-regular text-sm text-slate-400 md:text-lg drop-shadow",
  big: "font-regular text-lg text-slate-400 md:text-xl drop-shadow",
};

interface ContentProps {
  children: ReactNode;
  className?: string;
  variant?: string;
  color?: string;
  isSpan?: boolean;
}

type TagName = "h1" | "h2" | "h3" | "h4";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<ContentProps> = ({
    children,
    color = "text-slate-50",
    className = "",
    isSpan = false,
  }) => {
    if (isSpan) {
      return <span className={classNames(className, color)}>{children}</span>;
    }
    return (
      <Tag className={classNames(className, color, hClasses[Tag])}>
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

export const P = ({ children, className = "", variant }: ContentProps) => (
  <p
    className={classNames(
      className,
      variant === "big" ? pClasses.big : pClasses.normal
    )}
  >
    {children}
  </p>
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
  containerPaddingCSS?: string;
  innerPaddingCSS?: string;
  className?: string;
  src?: string;
  isSmall?: boolean;
}

export const ReactiveImg = ({
  children,
  colorCSS = "border-slate-700/40 bg-slate-900/30",
  colorHEX,
  containerPaddingCSS = "p-6",
  innerPaddingCSS = "p-3",
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
    <div className={classNames("group", containerPaddingCSS, className)}>
      <div
        style={style}
        className={classNames(
          colorCSS,
          innerPaddingCSS,
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
        "h-10 w-10 drop-shadow-[0_5px_5px_rgba(0,0,0,0.4)]"
      ),
    }
  );
  return (
    <ReactiveImg
      colorHEX={colorHEX}
      className="w-fit"
      containerPaddingCSS="p-3"
      innerPaddingCSS="p-3.5"
      isSmall
    >
      {modifiedChild}
    </ReactiveImg>
  );
};

interface SeparatorProps {
  color?: "red" | "amber" | "emerald" | "sky";
}

const colorTable = {
  red: "s-bg-red-400",
  amber: "s-bg-amber-400",
  sky: "s-bg-sky-400",
  emerald: "s-bg-emerald-400",
};

export const Separator = ({ color = "emerald" }: SeparatorProps) => (
  <div className={classNames("h-1 w-3", colorTable[color])} />
);
