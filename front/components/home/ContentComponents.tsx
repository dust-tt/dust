import {
  CircleIcon,
  HexagonIcon,
  Icon,
  LinkIcon,
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

const Span = ({ children, className = "" }: ContentProps) => (
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
    <div className="rounded-2xl bg-blue-50 px-6 py-4 sm:px-8 sm:py-6 md:px-10 lg:px-12 lg:py-0">
      <div className="flex flex-col items-center gap-6 sm:gap-8 md:gap-10 lg:flex-row lg:gap-16">
        <div className="w-full text-left lg:w-1/2">
          <H3 className="mb-4 sm:mb-6">Work amplified</H3>
          <P size="md" className="text-muted-foreground">
            Dust is your future-proof AI platform: we are model-agnostic and let
            you connect all your existing systems.
          </P>
        </div>
        <div className="flex w-full justify-center lg:h-96 lg:w-1/2 lg:justify-end lg:overflow-hidden lg:rounded-2xl">
          <img
            src="/static/landing/connectors/cloud_Connectors.svg"
            alt="Cloud Connectors"
            className="h-auto w-full max-w-md object-contain sm:max-w-lg md:max-w-xl lg:h-full lg:w-full lg:object-cover"
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
      <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
        <div className="rounded-2xl bg-gray-50 p-6">
          <div className="mb-6 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-blue.svg"
              alt="Blue geometric shape"
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-4">Data privacy</H3>
          <P size="sm" className="text-muted-foreground">
            Your data stays your data—never used for model training. Encryption
            at rest and in transit by default.
          </P>
        </div>
        <div className="rounded-2xl bg-gray-50 p-6">
          <div className="mb-6 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-red.svg"
              alt="Red geometric shape"
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-4">Access control</H3>
          <P size="sm" className="text-muted-foreground">
            Fine‑grained permissions with Spaces, SSO/SCIM support, and
            role‑based controls for sensitive information.
          </P>
        </div>
        <div className="rounded-2xl bg-gray-50 p-6">
          <div className="mb-6 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-green.svg"
              alt="Green geometric shape"
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-4">Compliance</H3>
          <P size="sm" className="text-muted-foreground">
            SOC 2 Type II certified. GDPR compliant. Enables HIPAA compliance.
            Enterprise audit logs and data residency options.
          </P>
        </div>
      </div>
    </div>
  );
}

export function TeamFeatureSection() {
  return (
    <div>
      <div className="flex w-full flex-col justify-between gap-6 md:flex-row">
        <div className="flex flex-1 flex-col rounded-2xl bg-blue-50 p-6">
          <Icon visual={RobotIcon} className="mb-4 h-8 w-8 text-blue-400" />
          <h4 className="text-lg font-semibold">Team orchestration</h4>
          <P size="sm" className="mt-1 text-muted-foreground">
            Build and manage teams of specialized agents that collaborate with
            humans.
          </P>
        </div>
        <div className="flex flex-1 flex-col rounded-2xl bg-golden-50 p-6">
          <Icon visual={LinkIcon} className="mb-4 h-8 w-8 text-golden-400" />
          <h4 className="text-lg font-semibold">
            Context-aware infrastructure
          </h4>
          <P size="sm" className="mt-1 text-muted-foreground">
            Connect agents to your company data and break down silos.
          </P>
        </div>
        <div className="flex flex-1 flex-col rounded-2xl bg-rose-50 p-6">
          <Icon visual={PlanetIcon} className="mb-4 h-8 w-8 text-rose-400" />
          <h4 className="text-lg font-semibold">Universal access layer</h4>
          <P size="sm" className="mt-1 text-muted-foreground">
            Seamlessly integrate with your existing tools and systems.
          </P>
        </div>
      </div>
    </div>
  );
}
