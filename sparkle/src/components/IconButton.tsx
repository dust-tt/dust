import { cva } from "class-variance-authority";
import React, { ComponentType, MouseEventHandler } from "react";

import { Tooltip } from "@sparkle/components";
import { Button, ButtonVariantType } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";

type IconButtonProps = {
  variant?: React.ComponentProps<typeof Button>["variant"];
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: React.ComponentProps<typeof Button>["size"];
  tooltip?: string;
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  icon: ComponentType;
  className?: string;
  disabled?: boolean;
};

const styleVariants: Record<ButtonVariantType, string> = {
  primary: [
    "s-text-action-500 dark:s-text-action-500-darkMode",
    "hover:s-text-action-400 dark:hover:s-text-action-500-darkMode",
    "active:s-text-action-600 dark:active:s-text-action-600-darkMode",
    "s-text-element-500 dark:s-text-element-500-darkMode"
  ].join(" "),
  warning: [
    "s-text-warning-500 dark:s-text-warning-500-darkMode",
    "hover:s-text-warning-400 dark:hover:s-text-warning-500-darkMode",
    "active:s-text-warning-600 dark:active:s-text-warning-600-darkMode",
    "s-text-element-500 dark:s-text-element-500-darkMode"
  ].join(" "),
  highlight: [
    "s-text-foreground dark:s-text-foreground-darkMode",
    "hover:s-text-action-400 dark:hover:s-text-action-500-darkMode",
    "active:s-text-action-600 dark:active:s-text-action-600-darkMode",
    "s-text-element-500 dark:s-text-element-500-darkMode"
  ].join(" "),
  outline: [
    "s-text-element-700 dark:s-text-element-700-darkMode",
    "hover:s-text-action-400 dark:hover:s-text-action-500-darkMode",
    "active:s-text-action-600 dark:active:s-text-action-600-darkMode",
    "s-text-element-500 dark:s-text-element-500-darkMode"
  ].join(" "),
  ghost: [
    "s-text-foreground dark:s-text-foreground-darkMode",
    "hover:s-text-primary-200 dark:hover:s-text-primary-200-darkMode",
    "active:s-text-primary-300 dark:active:s-text-primary-300-darkMode",
    "s-text-muted-foreground dark:s-text-muted-foreground-darkMode"
  ].join(" "),
  "ghost-secondary": [
    "s-text-muted-foreground dark:s-text-muted-foreground-darkMode",
    "hover:s-text-primary-200 dark:hover:s-text-primary-200-darkMode",
    "active:s-text-primary-300 dark:active:s-text-primary-300-darkMode",
    "s-text-muted-foreground/50 dark:s-text-muted-foreground-darkMode/50"
  ].join(" ")
};

const iconButtonVariants = cva(
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110",
  {
    variants: {
      variant: styleVariants,
      disabled: {
        true: "s-text-element-500 dark:s-text-element-500-darkMode s-cursor-default hover:s-scale-100",
      },
    },
    defaultVariants: {
      variant: "outline",
      disabled: false,
    },
  }
);

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = "outline",
      onClick,
      disabled = false,
      tooltip,
      icon,
      className,
      size = "sm",
      ...props
    },
    ref
  ) => (
    <Button
      tooltip={tooltip}
      className={cn(iconButtonVariants({ variant, disabled }), className)}
      onClick={onClick}
      disabled={disabled}
      ref={ref}
      size={size}
      icon={icon}
      variant={null}
      {...props}
    />
  )
);

export { IconButton };
