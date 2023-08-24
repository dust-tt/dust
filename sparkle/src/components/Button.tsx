import React, { ComponentType, MouseEvent } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";
import { Tooltip, TooltipProps } from "./Tooltip";

export type ButtonProps = {
  type?:
    | "primary"
    | "primaryWarning"
    | "secondary"
    | "secondaryWarning"
    | "tertiary";
  size?: "xs" | "sm" | "md";
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  label: string;
  labelVisible?: boolean;
  icon?: ComponentType;
  className?: string;
  tooltipPosition?: TooltipProps["position"];
};

const sizeClasses = {
  xs: "s-gap-x-1 s-px-3 s-py-1.5 s-text-xs s-font-semibold",
  sm: "s-gap-x-1 s-px-4 s-py-2 s-text-sm s-font-semibold",
  md: "s-gap-x-1.5 s-px-5 s-py-3 s-text-base s-font-bold",
};

const containerClasses = {
  xs: "s-px-0.5",
  sm: "s-px-1",
  md: "s-px-1",
};

const typeClasses = {
  primary: {
    base: "s-text-white s-bg-action-500 s-border-action-600",
    hover: "hover:s-bg-action-400 hover:s-border-action-500",
    active: "active:s-bg-action-600 active:s-border-action-700",
    dark: {
      base: "dark:s-bg-action-500-dark dark:s-border-action-600-dark",
      hover:
        "dark:hover:s-bg-action-500-dark dark:hover:s-border-action-500-dark",
      active:
        "dark:active:s-bg-action-600-dark dark:active:s-border-action-700-dark",
    },
  },
  primaryWarning: {
    base: "s-text-white s-bg-warning-500 s-border-warning-600",
    hover: "hover:s-bg-warning-400 hover:s-border-warning-500",
    active: "active:s-bg-warning-600 active:s-border-warning-700",
    dark: {
      base: "dark:s-bg-warning-500-dark dark:s-border-warning-600-dark",
      hover:
        "dark:hover:s-bg-warning-500-dark dark:hover:s-border-warning-500-dark",
      active:
        "dark:active:s-bg-warning-600-dark dark:active:s-border-warning-700-dark",
    },
  },
  secondary: {
    base: "s-text-action-500 s-border-structure-200 s-bg-structure-0",
    hover: "hover:s-bg-action-50 hover:s-border-action-200",
    active: "active:s-bg-action-100 active:s-border-action-500",
    dark: {
      base: "dark:s-text-action-500-dark dark:s-border-structure-300-dark dark:s-bg-structure-50-dark",
      hover:
        "dark:hover:s-bg-action-50-dark dark:hover:s-border-action-300-dark",
      active:
        "dark:active:s-bg-action-100-dark dark:active:s-border-action-500-dark",
    },
  },
  secondaryWarning: {
    base: "s-text-warning-500 s-border-structure-200 s-bg-structure-0",
    hover: "hover:s-bg-warning-50 hover:s-border-warning-200",
    active: "active:s-bg-warning-100 active:s-border-warning-500",
    dark: {
      base: "dark:s-text-warning-500-dark dark:s-border-structure-300-dark dark:s-bg-structure-50-dark",
      hover:
        "dark:hover:s-bg-warning-50-dark dark:hover:s-border-warning-300-dark",
      active:
        "dark:active:s-bg-warning-100-dark dark:active:s-border-warning-500-dark",
    },
  },
  tertiary: {
    base: "s-text-element-800 s-border-structure-200 s-bg-structure-0",
    hover:
      "hover:s-text-element-700 hover:s-bg-action-50 hover:s-border-action-200",
    active: "active:s-bg-action-100 active:s-border-action-500",
    dark: {
      base: "dark:s-text-element-700-dark dark:s-border-structure-300-dark dark:s-bg-structure-50-dark",
      hover:
        "dark:hover:s-bg-action-50-dark dark:hover:s-border-action-300-dark",
      active:
        "dark:active:s-bg-action-100-dark dark:active:s-border-action-500-dark",
    },
  },
};

export function Button({
  type = "primary",
  size = "sm",
  onClick,
  disabled = false,
  labelVisible = true,
  label,
  icon,
  className = "",
  tooltipPosition = "above",
}: ButtonProps) {
  const buttonClasses = classNames(
    "s-inline-flex s-items-center s-border s-transition-all s-ease-out s-duration-400 s-box-border s-rounded-full s-scale-95 hover:s-scale-100 hover:s-drop-shadow-md active:s-scale-95 active:s-drop-shadow-none s-whitespace-nowrap",
    sizeClasses[size],
    typeClasses[type]?.base,
    typeClasses[type]?.hover,
    typeClasses[type]?.active,
    typeClasses[type]?.dark?.base,
    typeClasses[type]?.dark?.hover,
    typeClasses[type]?.dark?.active,
    disabled ? "s-cursor-not-allowed s-opacity-50 s-bg-gray-200" : "",
    className
  );

  const finalContainerClasses = classNames(containerClasses[size]);

  return labelVisible ? (
    <button
      type="button"
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {icon && <Icon IconComponent={icon} size={size as IconProps["size"]} />}
      <div className={finalContainerClasses}>{label}</div>
    </button>
  ) : (
    <Tooltip label={label} position={tooltipPosition}>
      <button
        type="button"
        className={buttonClasses}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {icon && <Icon IconComponent={icon} size={size as IconProps["size"]} />}
      </button>
    </Tooltip>
  );
}
