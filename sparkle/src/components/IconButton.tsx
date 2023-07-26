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
  base: "text-element-700",
  hover: "hover:text-action-400",
  active: "active:text-action-600",
  disabled: "text-element-500",
  dark: {
    base: "dark:text-element-700-dark",
    hover: "dark:hover:text-action-500-dark",
    active: "dark:active:text-action-600-dark",
    disabled: "dark:text-element-500-dark",
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
  const finalIconClasses = classNames(
    className,
    baseClasses,
    iconClasses.base,
    iconClasses.hover,
    iconClasses.active,
    iconClasses.disabled,
    iconClasses.dark.base,
    iconClasses.dark.hover,
    iconClasses.dark.active,
    iconClasses.dark.disabled
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
