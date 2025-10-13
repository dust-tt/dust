import { cva } from "class-variance-authority";
import React, { ComponentType } from "react";

import { Button, ButtonProps } from "@sparkle/components/Button";
import { Icon } from "@sparkle/components/Icon";
import { cn } from "@sparkle/lib/utils";

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
  primary:
    "s-bg-muted-background dark:s-bg-muted-background-night s-border-border dark:s-border-border-night",
  success: "s-bg-success-100 dark:s-bg-success-100-night s-border-transparent",
  warning: "s-bg-warning-100 dark:s-bg-warning-100-night s-border-transparent",
  highlight:
    "s-bg-highlight-100 dark:s-bg-highlight-100-night s-border-transparent",
  info: "s-bg-info-100 dark:s-bg-info-100-night s-border-transparent",
  green: "s-bg-green-100 dark:s-bg-green-100-night s-border-transparent",
  blue: "s-bg-blue-100 dark:s-bg-blue-100-night s-border-transparent",
  rose: "s-bg-rose-100 dark:s-bg-rose-100-night s-border-transparent",
  golden: "s-bg-golden-100 dark:s-bg-golden-100-night s-border-transparent",
  outline: "s-bg-transparent s-border-border dark:s-border-border-night",
};

const contentMessageVariants = cva(
  "s-flex s-flex-col s-gap-1 s-rounded-xl s-py-4 s-px-5 s-border",
  {
    variants: {
      variant: sharedVariantStyles,
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

const contentMessageInlineVariants = cva(
  "s-flex s-items-center s-gap-3 s-rounded-xl s-py-3 s-px-4 s-border",
  {
    variants: {
      variant: sharedVariantStyles,
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconVariants = cva("s-shrink-0", {
  variants: {
    variant: {
      primary: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      warning: "s-text-warning-900 dark:s-text-warning-900-night",
      success: "s-text-success-900 dark:s-text-success-900-night",
      highlight: "s-text-highlight-900 dark:s-text-highlight-900-night",
      info: "s-text-info-900 dark:s-text-info-900-night",
      green: "s-text-green-900 dark:s-text-green-900-night",
      blue: "s-text-blue-900 dark:s-text-blue-900-night",
      rose: "s-text-rose-900 dark:s-text-rose-900-night",
      golden: "s-text-golden-900 dark:s-text-golden-900-night",
      outline: "s-text-muted-foreground dark:s-text-muted-foreground-night",
    },
  },
});

const titleVariants = cva("s-heading-sm", {
  variants: {
    variant: {
      primary: "s-text-foreground dark:s-text-foreground-night",
      warning: "s-text-warning-900 dark:s-text-warning-900-night",
      success: "s-text-success-900 dark:s-text-success-900-night",
      highlight: "s-text-highlight-900 dark:s-text-highlight-900-night",
      info: "s-text-info-900 dark:s-text-info-900-night",
      green: "s-text-green-900 dark:s-text-green-900-night",
      blue: "s-text-blue-900 dark:s-text-blue-900-night",
      rose: "s-text-rose-900 dark:s-text-rose-900-night",
      golden: "s-text-golden-900 dark:s-text-golden-900-night",
      outline: "s-text-foreground dark:s-text-foreground-night",
    },
  },
});

const textVariants = cva("s-text-sm", {
  variants: {
    variant: {
      primary: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      warning: "s-text-warning-900 dark:s-text-warning-900-night",
      success: "s-text-success-900 dark:s-text-success-900-night",
      highlight: "s-text-highlight-900 dark:s-text-highlight-900-night",
      info: "s-text-info-900 dark:s-text-info-900-night",
      green: "s-text-green-900 dark:s-text-green-900-night",
      blue: "s-text-blue-900 dark:s-text-blue-900-night",
      rose: "s-text-rose-900 dark:s-text-rose-900-night",
      golden: "s-text-golden-900 dark:s-text-golden-900-night",
      outline: "s-text-muted-foreground dark:s-text-muted-foreground-night",
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

function ContentMessage({
  title,
  variant = "info",
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
      {/* TODO(2025-08-13 aubin): Allow passing a ContentMessageAction here. */}
    </div>
  );
}

function ContentMessageAction(props: ButtonProps) {
  return (
    <Button
      size="xs"
      className={cn("s-shrink-0", props.className)}
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
        <Icon size="xs" visual={icon} className={iconVariants({ variant })} />
      )}
      <div className={cn("s-flex-1", textVariants({ variant }))}>
        {title && <span className={titleVariants({ variant })}>{title}</span>}
        {title && contentChildren.length > 0 && ": "}
        {contentChildren}
      </div>
      {actionChilds}
    </div>
  );
}

export { ContentMessage, ContentMessageAction, ContentMessageInline };
