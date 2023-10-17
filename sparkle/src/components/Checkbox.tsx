import React from "react";

import { Check, Dash } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

export interface CheckboxProps {
  variant?: "selectable" | "checkable";
  checked: boolean;
  disabled?: boolean;
  partialChecked?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Checkbox({
  variant = "selectable",
  checked,
  onChange,
  className = "",
  disabled,
  partialChecked,
}: CheckboxProps) {
  const baseStyleClasses = {
    base: "s-border s-justify-center s-w-5 s-h-5 s-rounded-md s-flex s-items-center s-transition-colors s-duration-300 s-ease-out",
    idle: "s-bg-structure-50 s-border-element-600 s-cursor-pointer",
    hover: "hover:s-border-action-500 hover:s-bg-action-200",
    disabled: "s-bg-structure-0 s-border-structure-300 s-cursor-default",
    dark: {
      base: "dark:s-bg-structure-50-dark dark:s-border-element-500-dark",
      hover:
        "dark:hover:s-border-action-500-dark dark:hover:s-bg-action-200-dark",
      disabled:
        "dark:s-bg-structure-0-dark dark:s-border-structure-300-dark s-cursor-default",
    },
  };

  const checkedIndicatorClasses = {
    base: "s-transition s-duration-300 s-ease-in-out",
    selected: "s-opacity-100 s-bg-action-500 dark:s-bg-action-500-dark",
    unselected: "s-opacity-0",
    partialChecked: "s-opacity-100 s-bg-element-700 dark:s-bg-element-700-dark",
    disabled: "s-opacity-100 s-bg-element-500 dark:s-bg-element-500-dark",
  };

  const combinedBaseClasses = classNames(
    baseStyleClasses.base,
    disabled ? baseStyleClasses.disabled : baseStyleClasses.idle,
    !disabled ? baseStyleClasses.hover : "",
    disabled ? baseStyleClasses.dark.disabled : baseStyleClasses.dark.base,
    !disabled ? baseStyleClasses.dark.hover : "",
    className
  );

  const combinedCheckedIndicatorClasses = classNames(
    checkedIndicatorClasses.base,
    disabled ? checkedIndicatorClasses.disabled : "",
    checked && !partialChecked && !disabled
      ? checkedIndicatorClasses.selected
      : "",
    partialChecked && !disabled ? checkedIndicatorClasses.partialChecked : "",
    !checked && !disabled ? checkedIndicatorClasses.unselected : ""
  );

  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
        className="s-hidden"
        disabled={disabled}
      />
      <div
        className={classNames(combinedBaseClasses, "s-relative s-text-white")}
      >
        <div
          className={combinedCheckedIndicatorClasses}
          style={{ width: "14px", height: "14px", borderRadius: "3px" }}
        ></div>
        {variant === "checkable" && (
          <div className="s-absolute">
            <Icon visual={partialChecked ? Dash : Check} size="xs" />
          </div>
        )}
      </div>
    </label>
  );
}
