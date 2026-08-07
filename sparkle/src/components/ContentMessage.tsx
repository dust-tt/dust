import { Button, type ButtonProps } from "@sparkle/components/Button";
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
  primary: "bg-stone-50 border-stone-150",
  success: "bg-success-50 border-success-200",
  warning: "bg-red-50 border-rose-100",
  highlight: "bg-highlight-50 border-highlight-100",
  info: "bg-orange-50 border-orange-100",
  green: "bg-success-50 border-success-200",
  blue: "bg-highlight-50 border-highlight-100",
  rose: "bg-red-50 border-rose-100",
  golden: "bg-orange-50 border-orange-100",
  outline: "bg-transparent border-stone-150",
};

const contentMessageVariants = cva("flex flex-col gap-3 border", {
  variants: {
    variant: sharedVariantStyles,
    size: {
      lg: "rounded-2xl p-4",
      md: "rounded-2xl p-4 max-w-xl",
      sm: "rounded-xl p-3 max-w-sm",
    },
  },
  defaultVariants: {
    variant: "info",
    size: "md",
  },
});

const contentMessageInlineVariants = cva(
  "flex items-center gap-2 rounded-xl border p-3",
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
      primary: "text-stone-800",
      warning: "text-red-800",
      success: "text-success-800",
      highlight: "text-highlight-800",
      info: "text-orange-800",
      green: "text-success-800",
      blue: "text-highlight-800",
      rose: "text-red-800",
      golden: "text-orange-800",
      outline: "text-muted-foreground",
    },
  },
});

const titleVariants = cva("", {
  variants: {
    variant: {
      primary: "text-stone-800",
      warning: "text-red-800",
      success: "text-success-800",
      highlight: "text-highlight-800",
      info: "text-orange-800",
      green: "text-success-800",
      blue: "text-highlight-800",
      rose: "text-red-800",
      golden: "text-orange-800",
      outline: "text-foreground",
    },
  },
});

const textVariants = cva("", {
  variants: {
    variant: {
      primary: "text-stone-800",
      warning: "text-red-800",
      success: "text-success-800",
      highlight: "text-highlight-800",
      info: "text-orange-800",
      green: "text-success-800",
      blue: "text-highlight-800",
      rose: "text-red-800",
      golden: "text-orange-800",
      outline: "text-muted-foreground",
    },
  },
});

const contentMessageSizeConfig: Record<
  ContentMessageSizeType,
  {
    iconSize: "xs" | "sm";
    headerGap: string;
    headerHeight: string;
    stackGap: string;
    titleClassName: string;
    textClassName: string;
  }
> = {
  sm: {
    iconSize: "xs",
    headerGap: "gap-1",
    headerHeight: "h-5",
    stackGap: "gap-1.5",
    titleClassName: "heading-xs",
    textClassName: "text-xs",
  },
  md: {
    iconSize: "sm",
    headerGap: "gap-1.5",
    headerHeight: "h-6",
    stackGap: "gap-2",
    titleClassName: "heading-sm",
    textClassName: "text-sm",
  },
  lg: {
    iconSize: "sm",
    headerGap: "gap-1.5",
    headerHeight: "h-6",
    stackGap: "gap-2",
    titleClassName: "heading-sm",
    textClassName: "text-sm",
  },
};

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
  const {
    iconSize,
    headerGap,
    headerHeight,
    stackGap,
    titleClassName,
    textClassName,
  } = contentMessageSizeConfig[size];

  return (
    <div className={cn(contentMessageVariants({ variant, size }), className)}>
      <div
        className={cn(
          "flex gap-3",
          action ? "items-center justify-between" : "flex-col"
        )}
      >
        <div className={cn("flex flex-col", stackGap)}>
          {(icon || title) && (
            <div className={cn("flex items-center", headerGap, headerHeight)}>
              {icon && (
                <Icon
                  size={iconSize}
                  visual={icon}
                  className={iconVariants({ variant })}
                />
              )}
              {title && (
                <div className={cn(titleClassName, titleVariants({ variant }))}>
                  {title}
                </div>
              )}
            </div>
          )}
          {children && (
            <div className={cn(textClassName, textVariants({ variant }))}>
              {children}
            </div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* TODO(2025-08-13 aubin): Allow passing a ContentMessageAction here. */}
    </div>
  );
}

function ContentMessageAction(props: ButtonProps) {
  return (
    <Button size="xs" className={cn("shrink-0", props.className)} {...props} />
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
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {icon && (
          <Icon size="xs" visual={icon} className={iconVariants({ variant })} />
        )}
        <div className={cn("min-w-0 text-xs", textVariants({ variant }))}>
          {title && (
            <span className={cn("heading-xs", titleVariants({ variant }))}>
              {title}
            </span>
          )}
          {title && contentChildren.length > 0 && ": "}
          {contentChildren}
        </div>
      </div>
      {actionChilds}
    </div>
  );
}

export { ContentMessage, ContentMessageAction, ContentMessageInline };
