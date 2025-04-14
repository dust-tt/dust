import {
  CheckCircleIcon,
  CircleIcon,
  EyeIcon,
  HexagonIcon,
  Icon,
  LinkIcon,
  LockIcon,
  PlanetIcon,
  RectangleIcon,
  RobotIcon,
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
  style?: React.CSSProperties;
}

type TagName = "h1" | "h2" | "h3" | "h4" | "h5";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<HContentProps> = ({
    children,
    className = "",
    mono = false,
    style,
  }) => {
    const baseClasses = mono
      ? classNames(
          hClasses[Tag].replace(/heading-/g, "heading-mono-"),
          "font-mono"
        )
      : classNames(hClasses[Tag], "font-sans");
    return (
      <Tag className={classNames(className, baseClasses)} style={style}>
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

export function CloudConnectorsSection() {
  return (
    <div className="rounded-2xl bg-gray-50 px-6 py-8 sm:px-8 sm:py-10 md:px-10 md:py-12 lg:px-12 lg:py-16">
      <div className="flex flex-col items-center gap-6 sm:gap-8 md:gap-10 lg:flex-row lg:gap-16">
        <div className="mb-2 w-full text-left sm:mb-4 md:mb-0 lg:w-1/2">
          <H3 className="mb-4 sm:mb-6">It's not ChatGPT. It's Dust</H3>
          <P size="md" className="text-muted-foreground">
            Dust is your future-proof AI platform: we are model-agnostic and let
            you connect all your existing systems
          </P>
        </div>
        <div className="flex w-full justify-center lg:w-1/2 lg:justify-end">
          <img
            src="/static/landing/connectors/cloud_Connectors.png"
            alt="Cloud Connectors"
            className="h-auto w-full max-w-[400px] object-contain sm:max-w-[480px] md:max-w-[560px] lg:h-[360px] lg:max-w-none"
          />
        </div>
      </div>
    </div>
  );
}

export function SecurityComplianceSection() {
  return (
    <div>
      <H2 className="mb-6 text-left">Security & compliance</H2>
      <div className="flex w-full flex-col justify-between gap-8 sm:gap-10 md:flex-row md:gap-6">
        <div className="flex flex-col text-left md:w-1/4">
          <div className="flex items-center">
            <Icon visual={LockIcon} className="mr-2 h-6" />
            <h4 className="text-lg font-semibold">Data-privacy</h4>
          </div>
          <P size="sm" className="mt-3 text-muted-foreground">
            Your data is your data. Never used for model training.
          </P>
        </div>
        <div className="flex flex-col text-left md:w-1/4">
          <div className="flex items-center">
            <Icon visual={EyeIcon} className="mr-2 h-6" />
            <h4 className="text-lg font-semibold">Access-control</h4>
          </div>
          <P size="sm" className="mt-3 text-muted-foreground">
            Fine-grained permissions with Spaces for sensitive information.
          </P>
        </div>
        <div className="flex flex-col text-left md:w-1/4">
          <div className="flex items-center">
            <Icon visual={CheckCircleIcon} className="mr-2 h-6" />
            <h4 className="text-lg font-semibold">Compliance</h4>
          </div>
          <P size="sm" className="mt-3 text-muted-foreground">
            SOC2 Type II certified, HIPAA and GDPR compliant.
          </P>
        </div>
      </div>
    </div>
  );
}

export function TeamFeatureSection() {
  return (
    <div>
      <div className="flex w-full flex-col justify-between gap-8 sm:gap-10 md:flex-row md:gap-6">
        <div className="flex flex-col text-left md:w-1/4">
          <div className="flex items-center">
            <Icon visual={RobotIcon} className="mr-2 h-6" />
            <h4 className="text-lg font-semibold">Team orchestration</h4>
          </div>
          <P size="sm" className="mt-3 text-muted-foreground">
            Build and manage teams of specialized agents that collaborate with
            humans
          </P>
        </div>
        <div className="flex flex-col text-left md:w-1/4">
          <div className="flex items-center">
            <Icon visual={LinkIcon} className="mr-2 h-6" />
            <h4 className="text-lg font-semibold">
              Context-aware infrastructure
            </h4>
          </div>
          <P size="sm" className="mt-3 text-muted-foreground">
            Connect agents to your company data and break down silos
          </P>
        </div>
        <div className="flex flex-col text-left md:w-1/4">
          <div className="flex items-center">
            <Icon visual={PlanetIcon} className="mr-2 h-6" />
            <h4 className="text-lg font-semibold">Universal access layer</h4>
          </div>
          <P size="sm" className="mt-3 text-muted-foreground">
            Seamlessly integrate with your existing tools and systems
          </P>
        </div>
      </div>
    </div>
  );
}
