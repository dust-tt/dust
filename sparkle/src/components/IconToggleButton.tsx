import React, { ComponentType, MouseEvent, useState } from "react";
import { classNames } from "@sparkle/lib/utils";
import { Tooltip } from "./Tooltip";
import { Icon } from "./Icon";

type IconToggleButtonProps = {
  type?: "secondary" | "tertiary";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  tooltip?: string;
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses =
  "transition-all ease-out duration-300 cursor-pointer hover:scale-110";

const iconClasses = {
  secondary: {
    idle: "text-element-900",
    selected: "text-action-500",
    hover: "hover:text-action-400",
    active: "active:text-action-600",
    disabled: "text-element-500",
    dark: {
      idle: "dark:text-element-900-dark",
      selected: "dark:text-action-500-dark",
      hover: "dark:hover:text-action-500-dark",
      active: "dark:active:text-action-600-dark",
      disabled: "dark:text-element-500-dark",
    },
  },
  tertiary: {
    idle: "text-element-600",
    selected: "text-action-500",
    hover: "hover:text-action-400",
    active: "active:text-action-600",
    disabled: "text-element-500",
    dark: {
      idle: "dark:text-element-600-dark",
      selected: "dark:text-action-500-dark",
      hover: "dark:hover:text-action-500-dark",
      active: "dark:active:text-action-600-dark",
      disabled: "dark:text-element-500-dark",
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
      {icon && <Icon IconComponent={icon} className="h-5 w-5" />}
    </button>
  );

  return tooltip ? (
    <Tooltip label={tooltip}>{IconButtonToggleContent}</Tooltip>
  ) : (
    IconButtonToggleContent
  );
}
