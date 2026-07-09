import {
  LegacyButton,
  type LegacyButtonProps,
} from "@sparkle/components/Button";
import { Icon } from "@sparkle/components/Icon";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ComponentType } from "react";

const CONTENT_MESSAGE_VARIANTS = [
  "primary",
  "warning",
  "success",
  "highlight",
  "info",
  "green",
  "blue",
  "rose",
  "golden",
  "outline",
] as const;

type ContentMessageVariantType = (typeof CONTENT_MESSAGE_VARIANTS)[number];

const CONTENT_MESSAGE_SIZES = ["sm", "md", "lg"] as const;

type ContentMessageSizeType = (typeof CONTENT_MESSAGE_SIZES)[number];

const sharedVariantStyles = {
  primary: "bg-muted-background",
  success: "bg-success-100",
  warning: "bg-warning-100",
  highlight: "bg-highlight-100",
  info: "bg-info-100",
  green: "bg-success-100",
  blue: "bg-highlight-100",
  rose: "bg-warning-100",
  golden: "bg-info-100",
  outline: "bg-transparent border border-border",
};

const contentMessageVariants = cva(
  "flex flex-col gap-1 rounded-2xl p-4 pl-5 min-h-[52px]",
  {
    variants: {
      variant: sharedVariantStyles,
      size: {
        lg: "",
        md: "max-w-xl",
        sm: "max-w-sm",
      },
    },
    defaultVariants: {
      variant: "info",
      size: "md",
    },
  }
);

const contentMessageInlineVariants = cva(
  "flex items-center gap-3 rounded-xl p-3 pl-4 min-h-[52px]",
  {
    variants: {
      variant: sharedVariantStyles,
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconVariants = cva("shrink-0", {
  variants: {
    variant: {
      primary: "text-muted-foreground",
      warning: "text-warning-900",
      success: "text-success-900",
      highlight: "text-highlight-900",
      info: "text-info-900",
      green: "text-success-900",
      blue: "text-highlight-900",
      rose: "text-warning-900",
      golden: "text-info-900",
      outline: "text-muted-foreground",
    },
  },
});

const titleVariants = cva("heading-sm", {
  variants: {
    variant: {
      primary: "text-foreground",
      warning: "text-warning-900",
      success: "text-success-900",
      highlight: "text-highlight-900",
      info: "text-info-900",
      green: "text-success-900",
      blue: "text-highlight-900",
      rose: "text-warning-900",
      golden: "text-info-900",
      outline: "text-foreground",
    },
  },
});

const textVariants = cva("text-sm", {
  variants: {
    variant: {
      primary: "text-muted-foreground",
      warning: "text-warning-900",
      success: "text-success-900",
      highlight: "text-highlight-900",
      info: "text-info-900",
      green: "text-success-900",
      blue: "text-highlight-900",
      rose: "text-warning-900",
      golden: "text-info-900",
      outline: "text-muted-foreground",
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
  size = "md",
  className = "",
  icon,
  action,
}: ContentMessageProps) {
  return (
    <div className={cn(contentMessageVariants({ variant, size }), className)}>
      <div
        className={cn(
          "flex gap-3",
          action ? "items-center justify-between" : "flex-col"
        )}
      >
        <div className="flex flex-col gap-1">
          {(icon || title) && (
            <div className="flex items-center gap-1.5">
              {icon && (
                <Icon
                  size="sm"
                  visual={icon}
                  className={iconVariants({ variant })}
                />
              )}
              {title && (
                <div className={titleVariants({ variant })}>{title}</div>
              )}
            </div>
          )}
          {children && (
            <div className={textVariants({ variant })}>{children}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* TODO(2025-08-13 aubin): Allow passing a ContentMessageAction here. */}
    </div>
  );
}

function ContentMessageAction(props: LegacyButtonProps) {
  return (
    <LegacyButton
      size="xs"
      className={cn("shrink-0", props.className)}
      {...props}
    />
  );
}

export interface ContentMessageInlineProps {
  title?: string;
  className?: string;
  children?: React.ReactNode;
  variant?: ContentMessageVariantType;
  icon?: ComponentType;
}

function ContentMessageInline({
  title,
  variant = "info",
  children,
  className = "",
  icon,
}: ContentMessageInlineProps) {
  const childrenArray = React.Children.toArray(children);

  const { actionChilds, contentChildren } = childrenArray.reduce(
    ({ actionChilds, contentChildren }, child) => {
      if (React.isValidElement(child) && child.type === ContentMessageAction) {
        actionChilds.push(child);
      } else {
        contentChildren.push(child);
      }
      return { actionChilds, contentChildren };
    },
    {
      actionChilds: [] as React.ReactNode[],
      contentChildren: [] as React.ReactNode[],
    }
  );

  return (
    <div className={cn(contentMessageInlineVariants({ variant }), className)}>
      {icon && (
        <Icon size="sm" visual={icon} className={iconVariants({ variant })} />
      )}
      <div className={cn("flex-1 min-w-0", textVariants({ variant }))}>
        {title && <span className={titleVariants({ variant })}>{title}</span>}
        {title && contentChildren.length > 0 && ": "}
        {contentChildren}
      </div>
      {actionChilds}
    </div>
  );
}

export { ContentMessage, ContentMessageAction, ContentMessageInline };
