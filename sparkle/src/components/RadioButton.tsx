import React from "react";

import { classNames } from "@sparkle/lib/utils";

export type RadioButtonProps = {
  name: string;
  choices: RadioButtonChoice[];
  value: string;
  className?: string;
  onChange: (value: string) => void;
};

export type RadioButtonChoice = {
  label: React.JSX.Element | string;
  value: string;
  disabled: boolean;
};

const labelClasses = {
  base: "s-text-sm s-text-element-800 dark:s-text-element-800-dark",
  disabled: "s-text-sm s-text-element-600 dark:s-text-element-600-dark",
};

const inputClasses = {
  base: "s-form-radio s-p-2 s-transition-colors s-duration-300 s-ease-out s-border-px",
  unselected: classNames(
    "s-cursor-pointer",
    "s-border-structure-300 s-bg-structure-50",
    "hover:s-bg-action-100 hover:s-border-action-300",
    "active:s-bg-action-200 active:s-border-action-400 active:s-ring-0",
    "dark:s-border-structure-400-dark dark:s-bg-structure-100-dark",
    "dark:hover:s-bg-structure-200-dark dark:hover:s-border-action-600-dark"
  ),
  selected: classNames(
    "s-bg-action-500 s-ring-0",
    "checked:s-ring-0 checked:s-bg-action-500"
  ),
  disabled:
    "s-cursor-default s-bg-structure-0 s-border-structure-300 dark:s-bg-structure-0-dark dark:s-border-structure-300-dark",
};

export function RadioButton({
  name,
  choices,
  className,
  value,
  onChange,
}: RadioButtonProps) {
  return (
    <div className={classNames("s-flex s-gap-3", className || "")}>
      {choices.map((choice) => (
        <div key={choice.value}>
          <label
            className={classNames(
              "s-flex s-items-center s-gap-2",
              choice.disabled ? labelClasses.disabled : labelClasses.base
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              disabled={choice.disabled}
              onChange={(e) => {
                onChange(e.target.value);
              }}
              className={classNames(
                inputClasses.base,
                choice.disabled
                  ? inputClasses.disabled
                  : choice.value === value
                    ? inputClasses.selected
                    : inputClasses.unselected
              )}
            />
            <span>{choice.label}</span>
          </label>
        </div>
      ))}
    </div>
  );
}
