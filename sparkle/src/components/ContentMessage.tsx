import { Button, type ButtonProps } from "@sparkle/components/Button";
import { Icon } from "@sparkle/components/Icon";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ComponentType } from "react";

const CONTENT_MESSAGE_VARIANTS = [
  "error",
  "success",
  "info",
  "warning",
  "gray",
] as const;

type ContentMessageVariantType = (typeof CONTENT_MESSAGE_VARIANTS)[number];

const CONTENT_MESSAGE_SIZES = ["sm", "xs"] as const;

type ContentMessageSizeType = (typeof CONTENT_MESSAGE_SIZES)[number];

// success-100 and highlight-100 are semantic tokens that remap automatically in
// dark mode (tokens.css .dark {}). red, orange, gray have no semantic alias so
// we pair them with explicit dark: variants following the same inversion pattern
// (100 → 900 for bg, 800 → 200 for text).
const containerVariants = cva("flex flex-col", {
  variants: {
    variant: {
      error: "bg-red-100 dark:bg-red-900",
      success: "bg-success-100",
      info: "bg-highlight-100",
      warning: "bg-orange-100 dark:bg-orange-900",
      gray: "bg-gray-100 dark:bg-gray-900",
    },
    size: {
      sm: "gap-3 p-4 rounded-2xl",
      xs: "gap-3 p-3 rounded-xl",
    },
  },
  defaultVariants: {
    variant: "info",
    size: "sm",
  },
});

const colorVariants = cva("", {
  variants: {
    variant: {
      error: "text-red-800 dark:text-red-200",
      success: "text-success-800",
      info: "text-highlight-800",
      warning: "text-orange-800 dark:text-orange-200",
      gray: "text-gray-800 dark:text-gray-200",
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
  action?: React.ReactNode;
}

function ContentMessage({
  title,
  variant = "info",
  children,
  size = "sm",
  className,
  icon,
  action,
}: ContentMessageProps) {
  const colorClass = colorVariants({ variant });
  const iconSize = size === "sm" ? "sm" : "xs";
  const titleClass = size === "sm" ? "heading-base" : "heading-sm";
  const bodyClass = size === "sm" ? "copy-sm" : "copy-xs";
  const innerGap = size === "sm" ? "gap-2" : "gap-1.5";

  return (
    <div className={cn(containerVariants({ variant, size }), className)}>
      {title ? (
        <div className={cn("flex flex-col", innerGap)}>
          <div className={cn("flex items-center", innerGap)}>
            {icon && (
              <Icon
                size={iconSize}
                visual={icon}
                className={cn("shrink-0", colorClass)}
              />
            )}
            <span className={cn(titleClass, colorClass)}>{title}</span>
          </div>
          {children && (
            <div className={cn(bodyClass, colorClass)}>{children}</div>
          )}
        </div>
      ) : (
        <div className={cn("flex items-start", innerGap)}>
          {icon && (
            <Icon
              size={iconSize}
              visual={icon}
              className={cn("shrink-0 mt-px", colorClass)}
            />
          )}
          {children && (
            <div className={cn("flex-1 min-w-0", bodyClass, colorClass)}>
              {children}
            </div>
          )}
        </div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function ContentMessageAction(props: ButtonProps) {
  return (
    <Button size="xs" className={cn("shrink-0", props.className)} {...props} />
  );
}

export { ContentMessage, ContentMessageAction, CONTENT_MESSAGE_VARIANTS };
