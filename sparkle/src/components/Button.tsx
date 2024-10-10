import React, {
  Children,
  cloneElement,
  ComponentType,
  MouseEvent,
  ReactNode,
} from "react";

import { Tooltip } from "@sparkle/components/Tooltip";
import { ChevronDownIcon, ChevronUpDownIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";

const BUTTON_VARIANTS = [
  "primary",
  "primaryWarning",
  "secondary",
  "secondaryWarning",
  "tertiary",
] as const;

export type ButtonVariantType = (typeof BUTTON_VARIANTS)[number];

export type ButtonProps = {
  variant?: ButtonVariantType;
  type?: "button" | "menu" | "select";
  size?: "xs" | "sm" | "md" | "lg";
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  hasMagnifying?: boolean;
  label: string;
  labelVisible?: boolean;
  icon?: ComponentType;
  className?: string;
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  disabledTooltip?: boolean;
};

const textClasses = {
  xs: "s-text-xs s-font-semibold s-rounded-lg",
  sm: "s-text-sm s-font-semibold s-rounded-xl",
  md: "s-text-base s-font-bold s-rounded-2xl",
  lg: "s-text-lg s-font-bold s-rounded-3xl",
};

const sizeClasses = {
  xs: "s-gap-x-1 s-px-2 s-h-7",
  sm: "s-gap-x-1 s-px-3 s-h-9",
  md: "s-gap-x-1.5 s-px-4 s-h-12",
  lg: "s-gap-x-3 s-px-5 s-h-16",
};

const containerClasses = {
  xs: "s-px-0.5",
  sm: "s-px-1",
  md: "s-px-1",
  lg: "s-px-1",
};

const variantClasses = {
  primary: {
    base: "s-text-white s-bg-action-500 s-border-action-600",
    hover: "hover:s-bg-action-400 hover:s-border-action-500",
    active: "active:s-bg-action-600 active:s-border-action-700",
    disabled: "s-text-white s-bg-action-200 s-border-action-200",
    dark: {
      base: "",
      hover: "",
      active: "",
      disabled:
        "dark:s-text-action-700-dark dark:s-bg-action-100-dark dark:s-border-action-200-dark dark:s-saturate-50",
    },
  },
  primaryWarning: {
    base: "s-text-white s-bg-warning-500 s-border-warning-600",
    hover: "hover:s-bg-warning-400 hover:s-border-warning-500",
    active: "active:s-bg-warning-600 active:s-border-warning-700",
    disabled: "s-text-white s-bg-warning-200 s-border-warning-200",
    dark: {
      base: "",
      hover: "",
      active: "",
      disabled:
        "dark:s-text-warning-700-dark dark:s-bg-warning-100-dark dark:s-border-warning-200-dark dark:s-saturate-50",
    },
  },
  secondary: {
    base: "s-text-action-500 s-border-structure-200 s-bg-structure-0",
    hover: "hover:s-bg-action-50 hover:s-border-action-200",
    active: "active:s-bg-action-100 active:s-border-action-500",
    disabled: "s-text-action-300 s-border-structure-200 s-bg-structure-0",
    dark: {
      base: "dark:s-text-action-600-dark dark:s-border-structure-200-dark dark:s-bg-structure-100-dark",
      hover:
        "dark:hover:s-text-action-700-dark dark:hover:s-bg-action-50-dark dark:hover:s-border-action-300-dark",
      active:
        "dark:active:s-bg-action-100-dark dark:active:s-border-action-500-dark",
      disabled:
        "dark:s-text-element-600-dark dark:s-border-structure-100-dark dark:s-bg-structure-200-dark",
    },
  },
  secondaryWarning: {
    base: "s-text-warning-500 s-border-structure-200 s-bg-structure-0",
    hover: "hover:s-bg-warning-50 hover:s-border-warning-200",
    active: "active:s-bg-warning-100 active:s-border-warning-500",
    disabled: "s-text-warning-300 s-border-structure-200 s-bg-structure-0",
    dark: {
      base: "dark:s-text-warning-600-dark dark:s-border-structure-300-dark dark:s-bg-structure-100-dark",
      hover:
        "dark:hover:s-bg-warning-50-dark dark:hover:s-border-warning-300-dark",
      active:
        "dark:active:s-bg-warning-100-dark dark:active:s-border-warning-500-dark",
      disabled:
        "dark:s-text-element-600-dark dark:s-border-structure-100-dark dark:s-bg-structure-200-dark",
    },
  },
  tertiary: {
    base: "s-text-element-800 s-border-structure-200 s-bg-structure-0",
    hover:
      "hover:s-bg-action-50 hover:s-text-action-500 hover:s-border-action-200",
    active:
      "active:s-bg-action-100 active:s-text-action-600 active:s-border-action-500",
    disabled: "s-text-element-500 s-border-structure-200 s-bg-structure-0",
    dark: {
      base: "dark:s-text-element-800-dark dark:s-border-structure-300-dark dark:s-bg-structure-100-dark",
      hover:
        "dark:hover:s-text-action-300 dark:hover:s-bg-action-50-dark dark:hover:s-border-action-300-dark",
      active:
        "dark:active:s-bg-action-100-dark dark:active:s-border-action-500-dark",
      disabled:
        "dark:s-text-element-600-dark dark:s-border-structure-100-dark dark:s-bg-structure-200-dark",
    },
  },
};

const transitionClasses =
  "s-transition-all s-ease-out s-duration-200 s-cursor-pointer";

const magnifyingClasses =
  "hover:s-scale-105 hover:s-drop-shadow-md active:s-scale-100 active:s-drop-shadow-none";

export function Button({
  variant = "primary",
  type = "button",
  size = "sm",
  onClick,
  disabled = false,
  labelVisible = true,
  label,
  icon,
  className = "",
  tooltipPosition,
  hasMagnifying = false,
  disabledTooltip = false,
}: ButtonProps) {
  let buttonClasses = classNames(
    "s-inline-flex s-items-center s-border s-scale-100 s-box-border s-whitespace-nowrap",
    sizeClasses[size],
    textClasses[size],
    className
  );
  if (disabled) {
    buttonClasses = classNames(
      buttonClasses,
      variantClasses[variant]?.disabled,
      variantClasses[variant]?.dark.disabled,
      disabled ? "s-cursor-default" : ""
    );
  } else {
    buttonClasses = classNames(
      buttonClasses,
      transitionClasses,
      hasMagnifying ? magnifyingClasses : "",
      variantClasses[variant]?.base,
      variantClasses[variant]?.hover,
      variantClasses[variant]?.active,
      variantClasses[variant]?.dark?.base,
      variantClasses[variant]?.dark?.hover,
      variantClasses[variant]?.dark?.active
    );
  }

  const finalContainerClasses = classNames(containerClasses[size]);

  const buttonBase = (
    <button
      type="button"
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {icon && <Icon visual={icon} size={size as IconProps["size"]} />}
      {labelVisible ? (
        <div className={classNames("s-truncate", finalContainerClasses)}>
          {label}
        </div>
      ) : null}
      {type === "menu" && (
        <Icon
          className="s-opacity-50"
          visual={ChevronDownIcon}
          size={size as IconProps["size"]}
        />
      )}
      {type === "select" && (
        <Icon
          className="s-opacity-60"
          visual={ChevronUpDownIcon}
          size={size as IconProps["size"]}
        />
      )}
    </button>
  );

  return labelVisible || disabledTooltip ? (
    buttonBase
  ) : (
    <Tooltip trigger={buttonBase} label={label} side={tooltipPosition} />
  );
}

interface ButtonListProps {
  children: ReactNode;
  isWrapping?: boolean;
  className?: string;
}

Button.List = function ({
  children,
  isWrapping = false,
  className,
}: ButtonListProps) {
  const modifiedChildren = Children.map(children, (child) => {
    // Check if this child is a Button
    if (React.isValidElement<ButtonProps>(child) && child.type === Button) {
      // Clone the element with hasMagnifying set to false
      return cloneElement(child, { hasMagnifying: false });
    }
    return child;
  });

  return (
    <div className={classNames(className ? className : "", "s-flex")}>
      <div
        className={classNames(
          "s-flex s-flex-row s-gap-2",
          isWrapping ? "s-flex-wrap" : "s-flex-nowrap"
        )}
      >
        {modifiedChildren}
      </div>
    </div>
  );
};
