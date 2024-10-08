import React, { ComponentType } from "react";

import { Separator } from "@sparkle/components/Separator";
import { classNames } from "@sparkle/lib/utils";

import { Button, ButtonProps } from "./Button";
import { Icon } from "./Icon";

interface PageProps {
  children: React.ReactNode;
  variant?: "modal" | "normal";
}

export function Page({ children, variant = "normal" }: PageProps) {
  const mainVariantClasses =
    variant === "normal" ? "s-h-full s-py-16" : "s-h-full s-py-4 s-px-2";
  const divVariantClassNames =
    variant === "normal" ? "s-gap-6 s-px-6" : "s-gap-4";

  return (
    <main className={mainVariantClasses}>
      <div
        className={classNames(
          "s-mx-auto s-flex s-h-full s-max-w-4xl s-flex-col s-text-sm s-font-normal s-text-element-900",
          divVariantClassNames
        )}
      >
        {children}
      </div>
    </main>
  );
}

interface PageHeaderProps {
  title: React.ReactNode;
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
        <Page.H variant="h5">{title}</Page.H>
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
    <Separator/>
  );
};

interface PagePProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}

const PsizeClasses = {
  xs: "s-text-xs",
  sm: "s-text-sm",
  md: "s-text-base",
  lg: "s-text-lg",
};

Page.P = function ({ children, variant, size = "sm" }: PagePProps) {
  return (
    <p
      className={classNames(
        PsizeClasses[size],
        variant === "secondary"
          ? "s-text-element-700 dark:s-text-element-600-dark"
          : "s-text-element-900 dark:s-text-element-900-dark"
      )}
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
    h6: "s-text-base s-font-semibold",
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

interface PageLayoutProps {
  children: React.ReactNode;
  direction?: "horizontal" | "vertical" | "fluid";
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

Page.Layout = function ({
  children,
  direction = "vertical",
  sizing,
  align = "stretch",
  gap = "lg",
}: PageLayoutProps) {
  switch (direction) {
    case "horizontal":
      return (
        <Page.Horizontal
          children={children}
          sizing={sizing}
          align={align}
          gap={gap}
        />
      );
    case "vertical":
      return (
        <Page.Vertical
          children={children}
          sizing={sizing}
          align={align}
          gap={gap}
        />
      );
    case "fluid":
      return (
        <Page.Fluid
          children={children}
          sizing={sizing}
          align={align}
          gap={gap}
        />
      );
    default:
      return null;
  }
};

interface PageDivProps {
  children: React.ReactNode;
  sizing?: "shrink" | "grow";
  align?: "stretch" | "left" | "center" | "right";
  gap?: "xs" | "sm" | "md" | "lg" | "xl" | "none";
}
Page.Horizontal = function ({
  children,
  sizing,
  align = "left",
  gap = "lg",
}: PageDivProps) {
  return (
    <div
      className={classNames(
        "s-flex s-flex-col sm:s-flex-row",
        sizing === "grow" ? "s-grow s-basis-0" : "",
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
        sizing === "grow" ? "s-grow s-basis-0" : "",
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
