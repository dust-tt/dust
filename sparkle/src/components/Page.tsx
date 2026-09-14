import { Separator } from "@sparkle/components/Separator";
import { cn } from "@sparkle/lib/utils";
import React from "react";

import { Button, type ButtonProps } from "./Button";

interface PageProps {
  children: React.ReactNode;
  /** `normal` for a full page (wide padding), `modal` for compact spacing inside a modal. */
  variant?: "modal" | "normal";
}

/**
 * A page-scaffolding namespace that stacks standardized content blocks with
 * consistent spacing: Page.Header, Page.SectionHeader, typography helpers
 * Page.P / Page.H, and arrangement helpers Page.Layout / Page.Horizontal /
 * Page.Vertical / Page.Fluid. Use it to build the vertical structure of a
 * settings, detail, or overview page with uniform rhythm.
 * @summary Standardized page scaffolding blocks.
 */
export function Page({ children, variant = "normal" }: PageProps) {
  const mainVariantClasses =
    variant === "normal" ? "h-full py-16" : "h-full py-4 px-2";
  const divVariantClassNames = variant === "normal" ? "gap-6 px-6" : "gap-4";

  return (
    <main className={mainVariantClasses}>
      <div
        className={cn(
          "mx-auto flex h-full max-w-4xl flex-col text-sm font-normal",
          "text-foreground",
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
  description?: React.ReactNode;
  noTopPadding?: boolean;
}

/** The page's top header: title with optional description, used once at the top of a Page. */
Page.Header = function ({ title, description, noTopPadding }: PageHeaderProps) {
  return (
    <Page.Vertical
      gap="xs"
      className={noTopPadding ? undefined : "pt-4 sm:pt-6 md:pt-8"}
    >
      {typeof title === "string" ? (
        <Page.H variant="h3">{title}</Page.H>
      ) : (
        <>{title}</>
      )}
      {description && <Page.P variant="secondary">{description}</Page.P>}
    </Page.Vertical>
  );
};

interface PageSectionHeaderProps {
  title: string;
  description?: string;
  /** Primary section CTA, rendered as a Button on the right of the header. */
  action?: ButtonProps;
}

/** A section delimiter: title, description, and an optional CTA via `action`. */
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

/** A horizontal divider between page blocks. */
Page.Separator = function () {
  return <Separator />;
};

interface PagePProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}

const PsizeClasses = {
  xs: "copy-xs",
  sm: "copy-sm",
  md: "copy-base",
  lg: "copy-lg",
};

/** A paragraph with standardized sizing (`size`) and a `primary`/`secondary` color variant. */
Page.P = function ({ children, variant, size = "sm" }: PagePProps) {
  return (
    <p
      className={cn(
        PsizeClasses[size],
        variant === "secondary" ? "text-muted-foreground" : "text-foreground"
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

/** A heading rendered as the given `variant` tag (h1-h6) with the matching type scale. */
Page.H = function ({ children, variant = "h3" }: PageHProps) {
  const Component = variant;

  const hSizes = {
    h1: "heading-4xl",
    h2: "heading-3xl",
    h3: "heading-2xl",
    h4: "heading-xl",
    h5: "heading-lg",
    h6: "heading-base",
  };

  return (
    <Component className={cn("text-foreground", hSizes[variant])}>
      {children}
    </Component>
  );
};

interface PageLayoutProps {
  children: React.ReactNode;
  /** How children flow: `horizontal` a row (column on small screens), `vertical` a column, `fluid` a wrapping row. */
  direction?: "horizontal" | "vertical" | "fluid";
  sizing?: "shrink" | "grow";
  align?: "stretch" | "left" | "center" | "right";
  gap?: "xs" | "sm" | "md" | "lg" | "xl" | "none";
}

const gapSizes = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-5",
  xl: "gap-8",
  none: "",
};

/** Arranges child blocks by `direction`, delegating to Page.Horizontal / Page.Vertical / Page.Fluid. */
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
  className?: string;
}
/** A horizontal row of blocks (stacks vertically on small screens). */
Page.Horizontal = function ({
  children,
  sizing,
  align = "left",
  gap = "lg",
}: PageDivProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row",
        sizing === "grow" ? "grow basis-0" : "",
        sizing === "shrink" ? "shrink" : "",
        gapSizes[gap],
        align === "left" ? "justify-start" : "",
        align === "center" ? "justify-center" : "",
        align === "right" ? "justify-end" : "",
        align === "stretch" ? "justify-stretch" : ""
      )}
    >
      {children}
    </div>
  );
};

/** A vertical column of blocks. */
Page.Vertical = function ({
  children,
  sizing,
  align = "left",
  gap = "md",
  className,
}: PageDivProps) {
  return (
    <div
      className={cn(
        "flex flex-col",
        sizing === "grow" ? "grow basis-0" : "",
        sizing === "shrink" ? "shrink" : "",
        gapSizes[gap],
        align === "left" ? "items-start" : "",
        align === "center" ? "items-center" : "",
        align === "right" ? "items-end" : "",
        className
      )}
    >
      {children}
    </div>
  );
};

/** A wrapping row of blocks for fluid, grid-like arrangements. */
Page.Fluid = function ({
  children,
  sizing,
  align = "stretch",
  gap = "xs",
}: PageDivProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap",
        sizing === "grow" ? "grow" : "",
        sizing === "shrink" ? "shrink" : "",
        gapSizes[gap],
        align === "left" ? "items-start" : "",
        align === "center" ? "items-center" : "",
        align === "right" ? "items-end" : ""
      )}
    >
      {children}
    </div>
  );
};
