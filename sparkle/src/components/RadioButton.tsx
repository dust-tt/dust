import React from "react";

import { classNames } from "@sparkle/lib/utils";

export type RadioButtonProps = {
  name: string;
  choices: RadioButtonChoice[];
  value: string;
  layout: "inline" | "stacked";
  onChange: (value: string) => void;
};

export type RadioButtonChoice = {
  label: string;
  value: string;
  disabled: boolean;
};

const labelClasses = {
  base: "dark:s-text-element-800-dark",
  selected: "s-opacity-100 s-bg-action-500",
  disabled: "s-opacity-50",
};

const inputClasses = {
  base: "focus:s-outline-none s-ring-0 s-bg-action-50 dark:s-bg-structure-200-dark dark:s-ring-structure-200-dark s-p-2",
  selected: "s-opacity-100 s-bg-action-500",
  disabled:
    "s-cursor-not-allowed dark:s-bg-structure-0-dark dark:s-border-structure-300-dark",
};

export function RadioButton({
  name,
  choices,
  value,
  layout,
  onChange,
}: RadioButtonProps) {
  return (
    <div
      className={classNames(
        "s-flex",
        layout === "inline" ? "s-flex-row s-gap-x-4" : "s-flex-col s-gap-y-2"
      )}
    >
      {choices.map((choice) => (
        <div key={choice.value}>
          <label
            className={classNames(
              "s-flex s-items-center s-space-x-2",
              labelClasses.base,
              choice.disabled ? labelClasses.disabled : ""
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
                choice.disabled ? inputClasses.disabled : "",
                choice.value === value ? inputClasses.selected : ""
              )}
            />
            <span>{choice.label}</span>
          </label>
        </div>
      ))}
    </div>
  );
}
