import React, { ComponentType, MouseEventHandler } from "react";

import { classNames, cn } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";
import { Tooltip } from "./Tooltip";

type IconToggleButtonProps = {
  variant?: "secondary" | "tertiary";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: "xs" | "sm" | "md";
  tooltip?: string;
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  icon: ComponentType;
  iconSelected?: ComponentType;
  className?: string;
  disabled?: boolean;
  selected?: boolean;
};

const baseClasses =
  "s-transition-all s-ease-out s-duration-300 s-cursor-pointer hover:s-scale-110";

const iconClasses = {
  secondary: {
    idle: cn("s-text-foreground", "dark:s-text-foreground-night"),
    selected: cn("s-text-highlight-500", "dark:s-text-highlight-500-night"),
    hover: cn(
      "hover:s-text-highlight-400",
      "dark:hover:s-text-highlight-400-night"
    ),
    active: cn(
      "active:s-text-highlight-600",
      "dark:active:s-text-highlight-600-night"
    ),
    disabled: cn("s-text-primary-500", "dark:s-text-primary-500-night"),
  },
  tertiary: {
    idle: cn("s-text-primary-600", "dark:s-text-primary-600-night"),
    selected: cn("s-text-highlight-500", "dark:s-text-highlight-500-night"),
    hover: cn(
      "hover:s-text-highlight-400",
      "dark:hover:s-text-highlight-400-night"
    ),
    active: cn(
      "active:s-text-highlight-600",
      "dark:active:s-text-highlight-600-night"
    ),
    disabled: cn("s-text-primary-500", "dark:s-text-primary-500-night"),
  },
};

export function IconToggleButton({
  variant = "tertiary",
  onClick,
  disabled = false,
  tooltip,
  tooltipPosition = "top",
  icon,
  iconSelected,
  className = "",
  selected = false,
  size = "sm",
}: IconToggleButtonProps) {
  const iconGroup = iconClasses[variant];
  const finalIconClasses = classNames(
    className,
    baseClasses,
    disabled
      ? iconGroup.disabled
      : selected
        ? iconGroup.selected
        : iconGroup.idle,
    disabled ? "" : selected ? "" : iconGroup.hover,
    disabled ? "" : iconGroup.active
  );

  const IconButtonToggleContent = (
    <button
      className={finalIconClasses}
      onClick={(e) => {
        if (!disabled) {
          onClick?.(e); // Run passed onClick event
        }
      }}
      disabled={disabled}
    >
      {icon && (
        <Icon
          visual={selected && iconSelected ? iconSelected : icon}
          size={size as IconProps["size"]}
        />
      )}
    </button>
  );

  return tooltip ? (
    <Tooltip
      trigger={IconButtonToggleContent}
      label={tooltip}
      side={tooltipPosition}
    />
  ) : (
    IconButtonToggleContent
  );
}
