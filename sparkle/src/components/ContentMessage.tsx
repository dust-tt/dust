import { cva } from "class-variance-authority";
import React, { ComponentType } from "react";

import { Icon } from "@sparkle/components/Icon";
import { cn } from "@sparkle/lib/utils";

const CONTENT_MESSAGE_VARIANTS = [
  "emerald",
  "amber",
  "slate",
  "purple",
  "warning",
  "sky",
  "pink",
  "action",
  "red",
] as const;

type ContentMessageVariantType = (typeof CONTENT_MESSAGE_VARIANTS)[number];

const CONTENT_MESSAGE_SIZES = ["sm", "md", "lg"] as const;

type ContentMessageSizeType = (typeof CONTENT_MESSAGE_SIZES)[number];

const contentMessageVariants = cva(
  "s-flex s-flex-col s-gap-1 s-rounded-2xl s-p-4",
  {
    variants: {
      variant: {
        emerald: "s-bg-emerald-100 dark:s-bg-emerald-100-night",
        amber: "s-bg-amber-100 dark:s-bg-amber-100-night",
        slate:
          "s-bg-muted-background dark:s-bg-muted-background-night s-border s-border-border dark:s-border-border-night",
        purple: "s-bg-purple-100 dark:s-bg-purple-100-night",
        warning: "s-bg-warning-100 dark:s-bg-warning-100-night",
        sky: "s-bg-sky-100 dark:s-bg-sky-100-night",
        pink: "s-bg-pink-100 dark:s-bg-pink-100-night",
        action: "s-bg-action-100 dark:s-bg-action-100-night",
        red: "s-bg-red-100 dark:s-bg-red-100-night",
      },
      size: {
        lg: "",
        md: "s-max-w-[500px]",
        sm: "s-max-w-[380px]",
      },
    },
    defaultVariants: {
      variant: "amber",
      size: "md",
    },
  }
);

const iconVariants = cva("s-shrink-0", {
  variants: {
    variant: {
      emerald: "s-text-emerald-800 dark:s-text-emerald-800-night",
      amber: "s-text-amber-800 dark:s-text-amber-800-night",
      slate: "s-text-slate-800 dark:s-text-slate-800-night",
      purple: "s-text-purple-800 dark:s-text-purple-800-night",
      warning: "s-text-warning-800 dark:s-text-warning-800-night",
      sky: "s-text-sky-800 dark:s-text-sky-800-night",
      pink: "s-text-pink-800 dark:s-text-pink-800-night",
      action: "s-text-action-800 dark:s-text-action-800-night",
      red: "s-text-red-800 dark:s-text-red-800-night",
    },
  },
});

const titleVariants = cva("s-text-sm s-font-semibold", {
  variants: {
    variant: {
      emerald: "s-text-emerald-800 dark:s-text-emerald-800-night",
      amber: "s-text-amber-800 dark:s-text-amber-800-night",
      slate: "s-text-foreground dark:s-text-foreground-night",
      purple: "s-text-purple-800 dark:s-text-purple-800-night",
      warning: "s-text-warning-800 dark:s-text-warning-800-night",
      sky: "s-text-sky-800 dark:s-text-sky-800-night",
      pink: "s-text-pink-800 dark:s-text-pink-800-night",
      action: "s-text-action-800 dark:s-text-action-800-night",
      red: "s-text-red-800 dark:s-text-red-800-night",
    },
  },
});

const textVariants = cva("s-text-sm", {
  variants: {
    variant: {
      emerald: "s-text-emerald-950 dark:s-text-emerald-950-night",
      amber: "s-text-amber-950 dark:s-text-amber-950-night",
      slate: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      purple: "s-text-purple-950 dark:s-text-purple-950-night",
      warning: "s-text-warning-950 dark:s-text-warning-950-night",
      sky: "s-text-sky-950 dark:s-text-sky-950-night",
      pink: "s-text-pink-950 dark:s-text-pink-950-night",
      action: "s-text-action-950 dark:s-text-action-950-night",
      red: "s-text-red-950 dark:s-text-red-950-night",
    },
  },
});

export interface ContentMessageProps {
  title?: string;
  children: React.ReactNode;
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
      <div className={textVariants({ variant })}>{children}</div>
    </div>
  );
}
