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
        emerald: "s-bg-emerald-100",
        amber: "s-bg-amber-100",
        slate: "s-bg-muted-background s-border s-border-border",
        purple: "s-bg-purple-100",
        warning: "s-bg-warning-100 dark:s-bg-warning-100-dark",
        sky: "s-bg-sky-100 dark:s-bg-sky-100-dark",
        pink: "s-bg-pink-100 dark:s-bg-pink-100-dark",
        action: "s-bg-action-100 dark:s-bg-action-100-dark",
        red: "s-bg-red-100 dark:s-bg-red-100-dark",
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
      emerald: "s-text-emerald-800",
      amber: "s-text-amber-800",
      slate: "s-text-slate-800",
      purple: "s-text-purple-800",
      warning: "s-text-warning-800",
      sky: "s-text-sky-800",
      pink: "s-text-pink-800",
      action: "s-text-action-800",
      red: "s-text-red-800",
    },
  },
});

const titleVariants = cva("s-text-sm s-font-semibold", {
  variants: {
    variant: {
      emerald: "s-text-emerald-800",
      amber: "s-text-amber-800",
      slate: "s-text-foreground",
      purple: "s-text-purple-800",
      warning: "s-text-warning-800",
      sky: "s-text-sky-800",
      pink: "s-text-pink-800",
      action: "s-text-action-800",
      red: "s-text-red-800",
    },
  },
});

const textVariants = cva("s-text-sm", {
  variants: {
    variant: {
      emerald: "s-text-emerald-950",
      amber: "s-text-amber-950",
      slate: "s-text-muted-foreground",
      purple: "s-text-purple-950",
      warning: "s-text-warning-950",
      sky: "s-text-sky-950",
      pink: "s-text-pink-950",
      action: "s-text-action-950",
      red: "s-text-red-950",
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
