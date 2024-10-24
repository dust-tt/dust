import { cva } from "class-variance-authority";
import React, { ComponentType, MouseEventHandler } from "react";

import { Button, ButtonVariantType } from "@sparkle/components/Button";

import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

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

const baseClasses =
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110";

const styleVariants: Record<ButtonVariantType, string> = {
  primary:
    "s-text-action-500 dark:s-text-action-500-dark" +
    "hover:s-text-action-400 dark:hover:s-text-action-500-dark" +
    "active:s-text-action-600 dark:active:s-text-action-600-dark" +
    "s-text-element-500 dark:s-text-element-500-dark",
  warning:
    "s-text-warning-500 dark:s-text-warning-500-dark" +
    "hover:s-text-warning-400 dark:hover:s-text-warning-500-dark" +
    "active:s-text-warning-600 dark:active:s-text-warning-600-dark" +
    "s-text-element-500 dark:s-text-element-500-dark",
  highlight:
    "s-text-element-900 dark:s-text-element-900-dark" +
    "hover:s-text-action-400 dark:hover:s-text-action-500-dark" +
    "active:s-text-action-600 dark:active:s-text-action-600-dark" +
    "s-text-element-500 dark:s-text-element-500-dark",
  outline:
    "s-text-element-700 dark:s-text-element-700-dark" +
    "hover:s-text-action-400 dark:hover:s-text-action-500-dark" +
    "active:s-text-action-600 dark:active:s-text-action-600-dark" +
    "s-text-element-500 dark:s-text-element-500-dark",
  ghost:
    "s-text-white s-text-white" +
    "hover:s-text-slate-100 hover:s-text-slate-100" +
    "active:s-text-slate-200 active:s-text-slate-200" +
    "s-text-white/50 s-text-white/50",
  white:
    "s-text-element-700 dark:s-text-element-700-dark" +
    "hover:s-text-action-400 dark:hover:s-text-action-500-dark" +
    "active:s-text-action-600 dark:active:s-text-action-600-dark" +
    "s-text-element-500 dark:s-text-element-500-dark",
};

const iconButtonVariants = cva(baseClasses, {
  variants: {
    variant: styleVariants,
    disabled: {
      true: "s-text-element-500 s-cursor-default hover:s-scale-100",
    },
  },
  defaultVariants: {
    variant: "outline",
    disabled: false,
  },
});

export function IconButton({
  variant,
  onClick,
  disabled = false,
  tooltip,
  tooltipPosition,
  icon,
  className,
  size,
}: IconButtonProps) {
  const iconSize = size || "sm";
  const buttonClasses = iconButtonVariants({ variant, disabled, className });

  const IconButtonContent = (
    <button className={buttonClasses} onClick={onClick} disabled={disabled}>
      <Icon visual={icon} size={iconSize} />
    </button>
  );

  return tooltip ? (
    <Tooltip
      trigger={IconButtonContent}
      label={tooltip}
      side={tooltipPosition}
      tooltipTriggerAsChild
    />
  ) : (
    IconButtonContent
  );
}
