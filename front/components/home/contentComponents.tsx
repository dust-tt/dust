import { Tooltip } from "@dust-tt/sparkle";
import classNames from "classnames";
import React, { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";

const defaultGridClasses =
  "grid grid-cols-12 gap-x-6 gap-y-8 px-6 md:px-12 lg:px-20 2xl:px-0";

const verticalGridClasses = {
  top: "items-start",
  center: "items-center",
  bottom: "items-end",
};

export const Grid = ({
  children,
  verticalAlign = "top",
  className = "",
}: ContentProps) => (
  <div
    className={classNames(
      className,
      defaultGridClasses,
      verticalGridClasses[verticalAlign]
    )}
  >
    {children}
  </div>
);

const hClasses = {
  h1: "font-objektiv text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl drop-shadow-lg",
  h2: "font-objektiv text-4xl font-bold tracking-tight lg:text-5xl xl:text-6xl drop-shadow-lg",
  h3: "font-objektiv text-xl font-bold tracking-tight lg:text-2xl xl:text-3xl drop-shadow-md",
  h4: "font-objektiv text-lg font-bold tracking-tight lg:text-xl xl:text-2xl drop-shadow-md",
};

interface ContentProps {
  children: ReactNode;
  verticalAlign?: "top" | "center" | "bottom";
  className?: string;
}

type TagName = "h1" | "h2" | "h3" | "h4";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<ContentProps> = ({ children, className = "" }) => {
    return (
      <Tag className={classNames(className, hClasses[Tag])}>{children}</Tag>
    );
  };
  Component.displayName = Tag.toUpperCase();
  return Component;
};

export const H1 = createHeadingComponent("h1");
export const H2 = createHeadingComponent("h2");
export const H3 = createHeadingComponent("h3");
export const H4 = createHeadingComponent("h4");

export const Span = ({ children, className = "" }: ContentProps) => (
  <span className={classNames(className)}>{children}</span>
);

const pClasses = {
  xs: "font-regular text-sm text-slate-400 md:text-base",
  sm: "font-regular text-base text-slate-400 md:text-lg",
  md: "font-regular text-base md:text-lg text-slate-400 lg:text-xl drop-shadow",
  lg: "font-regular text-lg md:text-xl text-slate-400 lg:text-2xl drop-shadow",
};

interface PProps {
  children: ReactNode;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  dotCSS?: string;
}

export const P = ({
  children,
  dotCSS = "",
  className = "",
  size = "md",
}: PProps) => {
  if (dotCSS) {
    return (
      <div className={classNames(className, "flex gap-2 lg:gap-4")}>
        <div
          className={classNames(
            dotCSS,
            "mt-1 h-4 w-2 flex-shrink-0 md:mt-1.5 lg:mt-0.5 lg:h-6 lg:w-3"
          )}
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
  tooltipLabel?: string;
}

export const ReactiveImg = ({
  children,
  colorCSS = "border-slate-700/40 bg-slate-900/30",
  colorHEX,
  paddingCSS = "p-3",
  className = "",
  isSmall = false,
  tooltipLabel,
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

  const image = (
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

  return tooltipLabel ? (
    <Tooltip label={tooltipLabel}>{image}</Tooltip>
  ) : (
    <>{image}</>
  );
};

export const ReactiveIcon = ({
  children,
  className = "",
  colorHEX,
  tooltipLabel,
}: ReactImgProps) => {
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
        "h-8 w-8 md:h-12 md:w-12 drop-shadow-[0_5px_5px_rgba(0,0,0,0.4)]"
      ),
    }
  );
  return (
    <ReactiveImg
      colorHEX={colorHEX}
      className={classNames("w-fit", className)}
      paddingCSS="p-4"
      tooltipLabel={tooltipLabel}
      isSmall
    >
      {modifiedChild}
    </ReactiveImg>
  );
};
