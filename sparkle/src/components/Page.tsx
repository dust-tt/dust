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
  return (
    <Page.Vertical gap="xs">
      <Icon visual={icon} className={iconClasses} size="lg" />
      <Page.H variant="h3">{title}</Page.H>
      {description && <Page.P variant="secondary">{description}</Page.P>}
    </Page.Vertical>
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
  return (
    <Page.Horizontal gap="md">
      <Page.Vertical gap="xs" sizing="grow">
        <Page.H variant="h4">{title}</Page.H>
        <Page.P variant="secondary">{description}</Page.P>
      </Page.Vertical>
      {action && (
        <div>
          <Button {...action} />
        </div>
      )}
    </Page.Horizontal>
  );
};

Page.Separator = function () {
  return (
    <div className="s-w-full s-py-2">
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
    <p
      className={
        variant === "secondary"
          ? "s-text-element-700 dark:s-text-element-600-dark"
          : "s-text-element-800 dark:s-text-element-800-dark"
      }
    >
      {children}
    </p>
  );
};

interface PageHProps {
  variant?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  children: React.ReactNode;
}

Page.H = function ({ children, variant = "h3" }: PageHProps) {
  const Component = variant;

  const hSizes = {
    h1: "s-text-4xl s-font-bold",
    h2: "s-text-3xl s-font-bold",
    h3: "s-text-2xl s-font-bold",
    h4: "s-text-xl s-font-semibold",
    h5: "s-text-lg s-font-semibold",
    h6: "s-text-base s-font-bold",
  };

  return (
    <Component
      className={classNames(
        "s-text-element-900 dark:s-text-element-900-dark",
        hSizes[variant]
      )}
    >
      {children}
    </Component>
  );
};

interface PageDivProps {
  children: React.ReactNode;
  sizing?: "shrink" | "grow";
  align?: "stretch" | "left" | "center" | "right";
  gap?: "xs" | "sm" | "md" | "lg" | "xl" | "none";
}

const gapSizes = {
  xs: "s-gap-1",
  sm: "s-gap-2",
  md: "s-gap-3",
  lg: "s-gap-5",
  xl: "s-gap-8",
  none: "",
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
