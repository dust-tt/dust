import { cva } from "class-variance-authority";
import React, { ComponentType } from "react";

import { Icon } from "@sparkle/components/Icon";
import { cn } from "@sparkle/lib/utils";

const CONTENT_MESSAGE_VARIANTS = [
  "emerald",
  "amber",
  "slate",
  "purple",
  "sky",
  "pink",
  "action",
  "red",
  //New variants
  "primary",
  "warning",
  "success",
  "highlight",
  "info",
  "green",
  "blue",
  "rose",
  "golden",
] as const;

type ContentMessageVariantType = (typeof CONTENT_MESSAGE_VARIANTS)[number];

const CONTENT_MESSAGE_SIZES = ["sm", "md", "lg"] as const;

type ContentMessageSizeType = (typeof CONTENT_MESSAGE_SIZES)[number];

const contentMessageVariants = cva(
  "s-flex s-flex-col s-gap-1 s-rounded-2xl s-p-4 s-border",
  {
    variants: {
      variant: {
        emerald:
          "s-bg-green-100 dark:s-bg-green-100-night s-border-transparent",
        amber:
          "s-bg-golden-100 dark:s-bg-golden-100-night s-border-transparent",
        slate:
          "s-bg-muted-background dark:s-bg-muted-background-night s-border s-border-border dark:s-border-border-night",
        purple:
          "s-bg-purple-100 dark:s-bg-purple-100-night s-border-transparent",
        sky: "s-bg-sky-100 dark:s-bg-sky-100-night s-border-transparent",
        pink: "s-bg-pink-100 dark:s-bg-pink-100-night s-border-transparent",
        action:
          "s-bg-highlight-100 dark:s-bg-highlight-100-night s-border-transparent",
        red: "s-bg-red-100 dark:s-bg-red-100-night s-border-transparent",
        // tbr
        primary:
          "s-bg-muted-background dark:s-bg-muted-background-night s-border-border dark:s-border-border-night",
        success:
          "s-bg-success-100 dark:s-bg-success-100-night s-border-transparent",
        warning:
          "s-bg-warning-100 dark:s-bg-warning-100-night s-border-transparent",
        highlight:
          "s-bg-highlight-100 dark:s-bg-highlight-100-night s-border-transparent",
        info: "s-bg-info-100 dark:s-bg-info-100-night s-border-transparent",
        green: "s-bg-green-100 dark:s-bg-green-100-night s-border-transparent",
        blue: "s-bg-blue-100 dark:s-bg-blue-100-night s-border-transparent",
        rose: "s-bg-rose-100 dark:s-bg-rose-100-night s-border-transparent",
        golden:
          "s-bg-golden-100 dark:s-bg-golden-100-night s-border-transparent",
      },
      size: {
        lg: "",
        md: "s-max-w-[500px]",
        sm: "s-max-w-[380px]",
      },
    },
    defaultVariants: {
      variant: "info",
      size: "md",
    },
  }
);

const iconVariants = cva("s-shrink-0", {
  variants: {
    variant: {
      emerald: "s-text-green-800 dark:s-text-green-800-night",
      amber: "s-text-golden-800 dark:s-text-golden-800-night",
      slate: "s-text-primary-800 dark:s-text-primary-800-night",
      purple: "s-text-purple-800 dark:s-text-purple-800-night",
      sky: "s-text-sky-800 dark:s-text-sky-800-night",
      pink: "s-text-pink-800 dark:s-text-pink-800-night",
      action: "s-text-highlight-800 dark:s-text-highlight-800-night",
      red: "s-text-red-800 dark:s-text-red-800-night",
      // tbr
      primary: "s-text-primary-800 dark:s-text-primary-800-night",
      warning: "s-text-warning-800 dark:s-text-warning-800-night",
      success: "s-text-success-800 dark:s-text-success-800-night",
      highlight: "s-text-highlight-800 dark:s-text-highlight-800-night",
      info: "s-text-info-800 dark:s-text-info-800-night",
      green: "s-text-green-800 dark:s-text-green-800-night",
      blue: "s-text-blue-800 dark:s-text-blue-800-night",
      rose: "s-text-rose-800 dark:s-text-rose-800-night",
      golden: "s-text-golden-800 dark:s-text-golden-800-night",
    },
  },
});

const titleVariants = cva("s-text-sm s-font-semibold", {
  variants: {
    variant: {
      emerald: "s-text-green-800 dark:s-text-green-800-night",
      amber: "s-text-golden-800 dark:s-text-golden-800-night",
      slate: "s-text-foreground dark:s-text-foreground-night",
      purple: "s-text-purple-800 dark:s-text-purple-800-night",
      sky: "s-text-sky-800 dark:s-text-sky-800-night",
      pink: "s-text-pink-800 dark:s-text-pink-800-night",
      action: "s-text-highlight-800 dark:s-text-highlight-800-night",
      red: "s-text-red-800 dark:s-text-red-800-night",
      // tbr
      primary: "s-text-foreground dark:s-text-foreground-night",
      warning: "s-text-warning-800 dark:s-text-warning-800-night",
      success: "s-text-success-800 dark:s-text-success-800-night",
      highlight: "s-text-highlight-800 dark:s-text-highlight-800-night",
      info: "s-text-info-800 dark:s-text-info-800-night",
      green: "s-text-green-800 dark:s-text-green-800-night",
      blue: "s-text-blue-800 dark:s-text-blue-800-night",
      rose: "s-text-rose-800 dark:s-text-rose-800-night",
      golden: "s-text-golden-800 dark:s-text-golden-800-night",
    },
  },
});

const textVariants = cva("s-text-sm", {
  variants: {
    variant: {
      emerald: "s-text-green-950 dark:s-text-green-950-night",
      amber: "s-text-golden-950 dark:s-text-golden-950-night",
      slate: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      purple: "s-text-purple-950 dark:s-text-purple-950-night",
      sky: "s-text-sky-950 dark:s-text-sky-950-night",
      pink: "s-text-pink-950 dark:s-text-pink-950-night",
      action: "s-text-highlight-950 dark:s-text-highlight-950-night",
      red: "s-text-red-950 dark:s-text-red-950-night",
      // tbr
      primary: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      warning: "s-text-warning-950 dark:s-text-warning-950-night",
      success: "s-text-success-950 dark:s-text-success-950-night",
      highlight: "s-text-highlight-950 dark:s-text-highlight-950-night",
      info: "s-text-info-950 dark:s-text-info-950-night",
      green: "s-text-green-950 dark:s-text-green-950-night",
      blue: "s-text-blue-950 dark:s-text-blue-950-night",
      rose: "s-text-rose-950 dark:s-text-rose-950-night",
      golden: "s-text-golden-950 dark:s-text-golden-950-night",
    },
  },
});

export interface ContentMessageProps {
  title?: string;
  children?: React.ReactNode;
  className?: string;
  size?: ContentMessageSizeType;
  variant?: ContentMessageVariantType;
  icon?: ComponentType;
}

export function ContentMessage({
  title,
  variant = "amber",
  children,
  size = "md",
  className = "",
  icon,
}: ContentMessageProps) {
  return (
    <div className={cn(contentMessageVariants({ variant, size }), className)}>
      {(icon || title) && (
        <div className="s-flex s-items-center s-gap-1.5">
          {icon && (
            <Icon
              size="xs"
              visual={icon}
              className={iconVariants({ variant })}
            />
          )}
          {title && <div className={titleVariants({ variant })}>{title}</div>}
        </div>
      )}
      {children && <div className={textVariants({ variant })}>{children}</div>}
    </div>
  );
}
