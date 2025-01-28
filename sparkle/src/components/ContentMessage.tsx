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
  "default",
] as const;

type ContentMessageVariantType = (typeof CONTENT_MESSAGE_VARIANTS)[number];

const CONTENT_MESSAGE_SIZES = ["sm", "md", "lg"] as const;

type ContentMessageSizeType = (typeof CONTENT_MESSAGE_SIZES)[number];

const contentMessageVariants = cva(
  "s-flex s-flex-col s-gap-1 s-rounded-2xl s-p-4",
  {
    variants: {
      variant: {
        emerald: "s-bg-emerald-100 dark:s-bg-emerald-100-darkMode",
        amber: "s-bg-amber-100 dark:s-bg-amber-100-darkMode",
        slate: [
          "s-bg-muted-background dark:s-bg-muted-background-darkMode",
          "s-border s-border-border dark:s-border-border-darkMode",
        ].join(" "),
        purple: "s-bg-purple-100 dark:s-bg-purple-100-darkMode",
        warning: "s-bg-warning-100 dark:s-bg-warning-100-darkMode",
        sky: "s-bg-sky-100 dark:s-bg-sky-100-darkMode",
        pink: "s-bg-pink-100 dark:s-bg-pink-100-darkMode",
        action: "s-bg-action-100 dark:s-bg-action-100-darkMode",
        red: "s-bg-red-100 dark:s-bg-red-100-darkMode",
        default: "",
      },
      size: {
        lg: "",
        md: "s-max-w-[500px]",
        sm: "s-max-w-[380px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

const iconVariants = cva("s-shrink-0", {
  variants: {
    variant: {
      emerald: "s-text-emerald-800 dark:s-text-emerald-800-darkMode",
      amber: "s-text-amber-800 dark:s-text-amber-800-darkMode",
      slate: "s-text-slate-800 dark:s-text-slate-800-darkMode",
      purple: "s-text-purple-800 dark:s-text-purple-800-darkMode",
      warning: "s-text-warning-800 dark:s-text-warning-800-darkMode",
      sky: "s-text-sky-800 dark:s-text-sky-800-darkMode",
      pink: "s-text-pink-800 dark:s-text-pink-800-darkMode",
      action: "s-text-action-800 dark:s-text-action-800-darkMode",
      red: "s-text-red-800 dark:s-text-red-800-darkMode",
      default: "s-text-primary-800 dark:s-text-primary-800-darkMode",
    },
  },
});

const titleVariants = cva("s-text-sm s-font-semibold", {
  variants: {
    variant: {
      emerald: "s-text-emerald-800 dark:s-text-emerald-800-darkMode",
      amber: "s-text-amber-800 dark:s-text-amber-800-darkMode",
      slate: "s-text-foreground dark:s-text-foreground-darkMode",
      purple: "s-text-purple-800 dark:s-text-purple-800-darkMode",
      warning: "s-text-warning-800 dark:s-text-warning-800-darkMode",
      sky: "s-text-sky-800 dark:s-text-sky-800-darkMode",
      pink: "s-text-pink-800 dark:s-text-pink-800-darkMode",
      action: "s-text-action-800 dark:s-text-action-800-darkMode",
      red: "s-text-red-800 dark:s-text-red-800-darkMode",
      default: "s-text-primary-800 dark:s-text-primary-800-darkMode",
    },
  },
});

const textVariants = cva("s-text-sm", {
  variants: {
    variant: {
      emerald: "s-text-emerald-950 dark:s-text-emerald-950-darkMode",
      amber: "s-text-amber-950 dark:s-text-amber-950-darkMode",
      slate: "s-text-muted-foreground dark:s-text-muted-foreground-darkMode",
      purple: "s-text-purple-950 dark:s-text-purple-950-darkMode",
      warning: "s-text-warning-950 dark:s-text-warning-950-darkMode",
      sky: "s-text-sky-950 dark:s-text-sky-950-darkMode",
      pink: "s-text-pink-950 dark:s-text-pink-950-darkMode",
      action: "s-text-action-950 dark:s-text-action-950-darkMode",
      red: "s-text-red-950 dark:s-text-red-950-darkMode",
      default: "s-text-primary-950 dark:s-text-primary-950-darkMode",
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
