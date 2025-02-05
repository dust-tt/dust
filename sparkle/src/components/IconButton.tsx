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
    "s-text-action-500 dark:s-text-action-500-night",
    "hover:s-text-action-400 dark:hover:s-text-action-500-night",
    "active:s-text-action-600 dark:active:s-text-action-600-night",
    "s-text-element-500 dark:s-text-element-500-night"
  ),
  warning: cn(
    "s-text-warning-500 dark:s-text-warning-500-night",
    "hover:s-text-warning-400 dark:hover:s-text-warning-500-night",
    "active:s-text-warning-600 dark:active:s-text-warning-600-night",
    "s-text-element-500 dark:s-text-element-500-night"
  ),
  highlight: cn(
    "s-text-foreground dark:s-text-foreground-night",
    "hover:s-text-action-400 dark:hover:s-text-action-500-night",
    "active:s-text-action-600 dark:active:s-text-action-600-night",
    "s-text-element-500 dark:s-text-element-500-night"
  ),
  outline: cn(
    "s-text-element-700 dark:s-text-element-700-night",
    "hover:s-text-action-400 dark:hover:s-text-action-500-night",
    "active:s-text-action-600 dark:active:s-text-action-600-night",
    "s-text-element-500 dark:s-text-element-500-night"
  ),
  ghost: cn(
    "s-text-white dark:s-text-black",
    "hover:s-text-slate-100 dark:hover:s-text-slate-100-night",
    "active:s-text-slate-200 dark:active:s-text-slate-200-night",
    "s-text-white/50 dark:s-text-black/50"
  ),
  "ghost-secondary": cn(
    "s-text-white",
    "hover:s-text-slate-100 dark:hover:s-text-slate-100-night",
    "active:s-text-slate-200 dark:active:s-text-slate-200-night",
    "s-text-white/50 dark:s-text-black/50"
  ),
};

const iconButtonVariants = cva(
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110",
  {
    variants: {
      variant: styleVariants,
      disabled: {
        true: cn(
          "s-text-element-500 dark:s-text-element-500-night",
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
