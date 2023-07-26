import React, { ComponentType, MouseEvent } from "react";
import { classNames } from "@sparkle/lib/utils";
import { Tooltip } from "./Tooltip";

import { Icon } from "./Icon";

type IconButtonProps = {
  type?: "primary" | "secondary" | "tertiary";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  tooltip?: string;
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
};

const baseClasses =
  "h-5 w-5 transition-colors ease-out duration-300 cursor-pointer";

const iconClasses = {
  primary: {
    base: "text-action-500",
    hover: "hover:text-action-400",
    active: "active:text-action-600",
    disabled: "text-element-500",
    dark: {
      base: "dark:text-action-500-dark",
      hover: "dark:hover:text-action-500-dark",
      active: "dark:active:text-action-600-dark",
      disabled: "dark:text-element-500-dark",
    },
  },
  secondary: {
    base: "text-element-900",
    hover: "hover:text-action-400",
    active: "active:text-action-600",
    disabled: "text-element-500",
    dark: {
      base: "dark:text-element-900-dark",
      hover: "dark:hover:text-action-500-dark",
      active: "dark:active:text-action-600-dark",
      disabled: "dark:text-element-500-dark",
    },
  },
  tertiary: {
    base: "text-element-600",
    hover: "hover:text-action-400",
    active: "active:text-action-600",
    disabled: "text-element-500",
    dark: {
      base: "dark:text-element-600-dark",
      hover: "dark:hover:text-action-500-dark",
      active: "dark:active:text-action-600-dark",
      disabled: "dark:text-element-500-dark",
    },
  },
};

export function IconButton({
  type = "tertiary",
  onClick,
  disabled = false,
  tooltip,
  icon,
  className = "",
}: IconButtonProps) {
  // Choose the correct group of classes based on 'type'
  const iconGroup = iconClasses[type];

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
      {icon && <Icon IconComponent={icon} />}
    </button>
  );

  return tooltip ? (
    <Tooltip label={tooltip}>{IconButtonContent}</Tooltip>
  ) : (
    IconButtonContent
  );
}
