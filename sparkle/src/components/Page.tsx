import React, { ComponentType } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Button, ButtonProps } from "./Button";
import { Icon } from "./Icon";

interface PageProps {
  children: React.ReactNode;
}

export function Page({ children }: PageProps) {
  return (
    <main className="s-h-full s-py-16">
      <div className="s-mx-auto s-flex s-h-full s-max-w-4xl s-flex-col s-gap-6 s-px-6 s-text-sm s-font-normal s-text-element-800">
        {children}
      </div>
    </main>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
}

Page.Header = function ({ title, description, icon }: PageHeaderProps) {
  const iconClasses = "s-text-brand";
  const titleClasses =
    "s-text-2xl s-font-bold s-text-element-900 s-self-stretch";
  const descriptionClasses =
    "s-text-sm s-font-normal s-text-element-700 s-self-stretch";

  return (
    <div className="s-inline-flex s-w-full s-basis-0 s-flex-col s-items-start s-justify-start s-gap-1">
      <Icon visual={icon} className={iconClasses} size="lg" />
      <div className={titleClasses}>{title}</div>
      {description && <div className={descriptionClasses}>{description}</div>}
    </div>
  );
};

interface PageSectionHeaderProps {
  title: string;
  description?: string;
  action?: ButtonProps;
}

Page.SectionHeader = function ({
  title,
  description,
  action,
}: PageSectionHeaderProps) {
  const titleClasses =
    "s-text-lg s-font-semibold s-text-element-900 s-self-stretch";
  const descriptionClasses = " s-self-stretch s-text-element-700";

  return (
    <div className="s-flex s-shrink s-grow s-basis-0 s-flex-col s-items-stretch s-justify-between s-gap-2 md:s-flex-row md:s-items-center">
      <div className="s-flex s-flex-row s-gap-2">
        <div className="s-flex s-flex-col s-gap-1">
          <div className={titleClasses}>{title}</div>
          <div className={descriptionClasses}>{description}</div>
        </div>
      </div>
      {action && (
        <div className="s-flex">
          <Button {...action} />
        </div>
      )}
    </div>
  );
};

Page.Separator = function () {
  return (
    <div className="s-w-full s-py-3">
      <div className="s-h-px s-w-full s-bg-structure-200" />
    </div>
  );
};

interface PagePProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

Page.P = function ({ children, variant }: PagePProps) {
  return (
    <p className={variant === "secondary" ? "s-text-element-700" : ""}>
      {children}
    </p>
  );
};

interface PageHProps {
  variant: "h1" | "h2" | "h3";
  children: React.ReactNode;
}

Page.H = function ({ children, variant }: PageHProps) {
  const Component = variant;

  const hSizes = {
    h1: "s-text-2xl s-font-bold s-text-element-900",
    h2: "s-text-lg s-font-semibold s-text-element-900",
    h3: "s-text-base s-font-bold s-text-element-900",
  };

  return <Component className={hSizes[variant]}>{children}</Component>;
};

interface PageDivProps {
  children: React.ReactNode;
  sizing?: "shrink" | "grow";
  align?: "stretch" | "left" | "center" | "right";
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
}

const gapSizes = {
  xs: "s-gap-2",
  sm: "s-gap-3",
  md: "s-gap-4",
  lg: "s-gap-6",
  xl: "s-gap-8",
};

Page.Horizontal = function ({
  children,
  sizing,
  align = "left",
  gap = "lg",
}: PageDivProps) {
  return (
    <div
      className={classNames(
        "s-flex s-flex-row",
        sizing === "grow" ? "s-grow" : "",
        sizing === "shrink" ? "s-shrink" : "",
        gapSizes[gap],
        align === "left" ? "s-justify-start" : "",
        align === "center" ? "s-justify-center" : "",
        align === "right" ? "s-justify-end" : "",
        align === "stretch" ? "s-justify-stretch" : ""
      )}
    >
      {children}
    </div>
  );
};

Page.Vertical = function ({
  children,
  sizing,
  align = "left",
  gap = "md",
}: PageDivProps) {
  return (
    <div
      className={classNames(
        "s-flex s-flex-col",
        sizing === "grow" ? "s-grow" : "",
        sizing === "shrink" ? "s-shrink" : "",
        gapSizes[gap],
        align === "left" ? "s-items-start" : "",
        align === "center" ? "s-items-center" : "",
        align === "right" ? "s-items-end" : ""
      )}
    >
      {children}
    </div>
  );
};

Page.Fluid = function ({
  children,
  sizing,
  align = "stretch",
  gap = "xs",
}: PageDivProps) {
  return (
    <div
      className={classNames(
        "s-flex s-flex-wrap",
        sizing === "grow" ? "s-grow" : "",
        sizing === "shrink" ? "s-shrink" : "",
        gapSizes[gap],
        align === "left" ? "s-items-start" : "",
        align === "center" ? "s-items-center" : "",
        align === "right" ? "s-items-end" : ""
      )}
    >
      {children}
    </div>
  );
};
