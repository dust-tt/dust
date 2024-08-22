import React from "react";

import { Check, Dash } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

export interface CheckboxProps {
  variant?: "selectable" | "checkable";
  size?: "xs" | "sm";
  checked?: true | false | "partial";
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Checkbox({
  variant = "selectable",
  checked = false,
  size = "sm",
  onChange,
  className = "",
  disabled,
}: CheckboxProps) {
  let isChecked: boolean;
  let isPartialChecked: boolean;
  switch (checked) {
    case true:
      isChecked = true;
      isPartialChecked = false;
      break;
    case false:
      isChecked = false;
      isPartialChecked = false;
      break;
    case "partial":
      isChecked = true;
      isPartialChecked = true;
      break;
    default:
      throw new Error("Invalid checked prop");
  }

  const baseStyleClasses = {
    base: "s-border s-justify-center s-flex s-items-center s-transition-colors s-duration-300 s-ease-out",
    idle: "s-bg-structure-50 s-border-element-600 s-cursor-pointer",
    hover:
      "hover:s-border-action-500 hover:s-bg-action-200 hover:s-text-white/100",
    disabled: "s-bg-structure-0 s-border-structure-300 s-cursor-default",
    dark: {
      base: "dark:s-bg-structure-50-dark dark:s-border-element-500-dark",
      hover:
        "dark:hover:s-border-action-500-dark dark:hover:s-bg-action-200-dark",
      disabled:
        "dark:s-bg-structure-0-dark dark:s-border-structure-300-dark s-cursor-default",
    },
  };

  const baseSizeClasses = {
    xs: "s-w-4 s-h-4 s-rounded",
    sm: "s-w-5 s-h-5 s-rounded-md",
  };

  const checkedIndicatorClasses = {
    base: "s-transition s-duration-300 s-ease-in-out",
    selected: "s-opacity-100 s-bg-action-500 dark:s-bg-action-500-dark",
    unselected: "s-opacity-0",
    partialChecked: "s-opacity-100 s-bg-element-700 dark:s-bg-element-700-dark",
    disabled: "s-opacity-100 s-bg-element-500 dark:s-bg-element-500-dark",
  };

  const sizeStyles = {
    xs: { width: "12px", height: "12px", borderRadius: "2px" },
    sm: { width: "14px", height: "14px", borderRadius: "3px" },
  };

  const combinedBaseClasses = classNames(
    baseStyleClasses.base,
    baseSizeClasses[size],
    isChecked || isPartialChecked ? "s-text-white" : "s-text-white/0",
    disabled ? baseStyleClasses.disabled : baseStyleClasses.idle,
    !disabled ? baseStyleClasses.hover : "",
    disabled ? baseStyleClasses.dark.disabled : baseStyleClasses.dark.base,
    !disabled ? baseStyleClasses.dark.hover : "",
    className
  );

  const combinedCheckedIndicatorClasses = classNames(
    checkedIndicatorClasses.base,
    disabled ? checkedIndicatorClasses.disabled : "",
    isChecked && !isPartialChecked && !disabled
      ? checkedIndicatorClasses.selected
      : "",
    isPartialChecked && !disabled ? checkedIndicatorClasses.partialChecked : "",
    !isChecked && !disabled ? checkedIndicatorClasses.unselected : ""
  );

  return (
    <label>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onChange && onChange(e.target.checked)}
        className="s-hidden"
        disabled={disabled}
      />
      <div className={classNames(combinedBaseClasses, "s-relative")}>
        <div
          className={combinedCheckedIndicatorClasses}
          style={sizeStyles[size]}
        />
        {variant === "checkable" && (
          <div className="s-absolute">
            <Icon visual={isPartialChecked ? Dash : Check} size="xs" />
          </div>
        )}
      </div>
    </label>
  );
}
