import React, { ComponentType, MouseEventHandler, useState } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

type IconToggleButtonProps = {
  type?: "secondary" | "tertiary";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  tooltip?: string;
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses =
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110";

const iconClasses = {
  secondary: {
    idle: "s-text-element-900",
    selected: "s-text-action-500",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      idle: "dark:s-text-element-900-dark",
      selected: "dark:s-text-action-500-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
  tertiary: {
    idle: "s-text-element-600",
    selected: "s-text-action-500",
    hover: "hover:s-text-action-400",
    active: "active:s-text-action-600",
    disabled: "s-text-element-500",
    dark: {
      idle: "dark:s-text-element-600-dark",
      selected: "dark:s-text-action-500-dark",
      hover: "dark:hover:s-text-action-500-dark",
      active: "dark:active:s-text-action-600-dark",
      disabled: "dark:s-text-element-500-dark",
    },
  },
};

export function IconToggleButton({
  type = "tertiary",
  onClick,
  disabled = false,
  tooltip,
  icon,
  className = "",
  selected: isSelected = false,
}: IconToggleButtonProps) {
  const [selected, setSelected] = useState(isSelected);

  const iconGroup = iconClasses[type];
  const finalIconClasses = classNames(
    className,
    baseClasses,
    disabled
      ? iconGroup.disabled
      : selected
      ? iconGroup.selected
      : iconGroup.idle,
    disabled ? "" : selected ? "" : iconGroup.hover,
    disabled ? "" : iconGroup.active,
    iconGroup.dark.idle,
    disabled
      ? iconGroup.dark.disabled
      : selected
      ? iconGroup.dark.selected
      : "",
    disabled ? "" : selected ? "" : iconGroup.dark.hover,
    disabled ? "" : iconGroup.dark.active
  );

  const IconButtonToggleContent = (
    <button
      className={finalIconClasses}
      onClick={(e) => {
        if (!disabled) {
          setSelected(!selected); // Toggle selected state
          onClick?.(e); // Run passed onClick event
        }
      }}
      disabled={disabled}
    >
      {icon && <Icon IconComponent={icon} className="s-h-5 s-w-5" />}
    </button>
  );

  return tooltip ? (
    <Tooltip label={tooltip}>{IconButtonToggleContent}</Tooltip>
  ) : (
    IconButtonToggleContent
  );
}
