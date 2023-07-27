import React from "react";

import { classNames } from "@sparkle/lib/utils";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onChange,
  className = "",
  disabled,
}: CheckboxProps) {
  const baseStyleClasses = {
    base: "s-border s-bg-structure-50 s-justify-center s-w-5 s-h-5 s-border-element-600 s-rounded-md s-flex s-items-center s-transition-colors s-duration-200 s-ease-in-out",
    hover: "hover:s-border-action-500 hover:s-bg-action-200",
    dark: {
      base: "dark:s-bg-structure-50-dark dark:s-border-element-500-dark",
      hover:
        "dark:hover:s-border-action-500-dark dark:hover:s-bg-action-200-dark",
    },
  };

  const checkedIndicatorClasses = {
    base: "s-h-3 s-w-3 s-rounded s-bg-action-500 dark:s-bg-action-500-dark s-transition-opacity s-duration-200 s-ease-in-out",
    selected: "s-opacity-100",
    unselected: "s-opacity-0",
  };

  const combinedBaseClasses = classNames(
    baseStyleClasses.base,
    baseStyleClasses.hover,
    baseStyleClasses.dark.base,
    baseStyleClasses.dark.hover,
    className
  );

  const combinedCheckedIndicatorClasses = classNames(
    checkedIndicatorClasses.base,
    checked
      ? checkedIndicatorClasses.selected
      : checkedIndicatorClasses.unselected
  );

  return (
    <label className="s-cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
        className="s-hidden"
        disabled={disabled}
      />
      <div className={combinedBaseClasses}>
        <div className={combinedCheckedIndicatorClasses}></div>
      </div>
    </label>
  );
}
