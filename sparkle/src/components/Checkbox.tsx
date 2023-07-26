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
    base: "border bg-structure-50 justify-center w-5 h-5 border-element-600 rounded-md flex items-center transition-colors duration-200 ease-in-out",
    hover: "hover:border-action-500 hover:bg-action-200",
    dark: {
      base: "dark:bg-structure-50-dark dark:border-element-500-dark",
      hover: "dark:hover:border-action-500-dark dark:hover:bg-action-200-dark",
    },
  };

  const checkedIndicatorClasses = {
    base: "h-3 w-3 rounded bg-action-500 dark:bg-action-500-dark transition-opacity duration-200 ease-in-out",
    selected: "opacity-100",
    unselected: "opacity-0",
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
    <label className="cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
        className="hidden"
        disabled={disabled}
      />
      <div className={combinedBaseClasses}>
        <div className={combinedCheckedIndicatorClasses}></div>
      </div>
    </label>
  );
}
