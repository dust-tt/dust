import React, { ComponentType, MouseEventHandler } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";
import { Tooltip } from "./Tooltip";

type IconButtonProps = {
  variant?: "primary" | "warning" | "secondary" | "tertiary" | "white";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: "xs" | "sm" | "md";
  tooltip?: string;
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
};

const baseClasses =
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110";

const iconClasses = {
  primary: {
    base: "s-text-action-500",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-action-500-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  warning: {
    base: "s-text-warning-500",
    hover: "hover:s-text-warning-400",
    active: "active:s-text-warning-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-warning-500-dark",
      hover: "dark:hover:s-text-warning-500-dark",
      active: "dark:active:s-text-warning-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  secondary: {
    base: "s-text-element-900",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-element-900-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  tertiary: {
    base: "s-text-element-700",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      base: "dark:s-text-element-700-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  white: {
    base: "s-text-white",
    hover: "hover:s-text-slate-100",
    active: "active:s-text-slate-200",
    disabled: "s-text-white/50",
    dark: {
      base: "s-text-white",
      hover: "hover:s-text-slate-100",
      active: "active:s-text-slate-200",
      disabled: "s-text-white/50",
    },
  },
};

export function IconButton({
  variant = "tertiary",
  onClick,
  disabled = false,
  tooltip,
  tooltipPosition = "top",
  icon,
  className = "",
  size = "sm",
}: IconButtonProps) {
  // Choose the correct group of classes based on 'type'
  const iconGroup = iconClasses[variant];

  const finalIconClasses = classNames(
    className,
    baseClasses,
    iconGroup.base,
    disabled ? iconGroup.disabled : iconGroup.hover,
    disabled ? "" : iconGroup.active,
    iconGroup.dark.base,
    disabled ? iconGroup.dark.disabled : iconGroup.dark.hover,
    disabled ? "" : iconGroup.dark.active
  );

  const IconButtonContent = (
    <button
      className={finalIconClasses}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {icon && <Icon visual={icon} size={size as IconProps["size"]} />}
    </button>
  );

  return tooltip ? (
    <Tooltip
      trigger={IconButtonContent}
      label={tooltip}
      side={tooltipPosition}
    />
  ) : (
    IconButtonContent
  );
}
