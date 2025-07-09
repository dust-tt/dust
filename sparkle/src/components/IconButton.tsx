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
  primary: cn(
    "s-text-highlight-500 dark:s-text-highlight-500-night",
    "hover:s-text-highlight-400 dark:hover:s-text-highlight-500-night",
    "active:s-text-highlight-600 dark:active:s-text-highlight-600-night",
    "s-text-primary-500 dark:s-text-primary-500-night"
  ),
  warning: cn(
    "s-text-warning-500 dark:s-text-warning-500-night",
    "hover:s-text-warning-400 dark:hover:s-text-warning-500-night",
    "active:s-text-warning-600 dark:active:s-text-warning-600-night",
    "s-text-primary-500 dark:s-text-primary-500-night"
  ),
  highlight: cn(
    "s-text-foreground dark:s-text-foreground-night",
    "hover:s-text-highlight-400 dark:hover:s-text-highlight-500-night",
    "active:s-text-highlight-600 dark:active:s-text-highlight-600-night",
    "s-text-primary-500 dark:s-text-primary-500-night"
  ),
  outline: cn(
    "s-text-primary-700 dark:s-text-primary-700-night",
    "hover:s-text-primary-400 dark:hover:s-text-primary-400-night",
    "active:s-text-highlight-600 dark:active:s-text-highlight-600-night",
    "s-text-primary-500 dark:s-text-primary-500-night"
  ),
  ghost: cn(
    "s-text-white dark:s-text-primary-950",
    "hover:s-text-primary-100 dark:hover:s-text-primary-100-night",
    "active:s-text-primary-200 dark:active:s-text-primary-200-night",
    "s-text-white/50 dark:s-text-primary-950/50"
  ),
  "ghost-secondary": cn(
    "s-text-white",
    "hover:s-text-primary-100 dark:hover:s-text-primary-100-night",
    "active:s-text-primary-200 dark:active:s-text-primary-200-night",
    "s-text-white/50 dark:s-text-primary-950/50"
  ),
};

const iconButtonVariants = cva(
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110",
  {
    variants: {
      variant: styleVariants,
      disabled: {
        true: cn(
          "s-text-primary-500 dark:s-text-primary-500-night",
          "s-cursor-default hover:s-scale-100"
        ),
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
