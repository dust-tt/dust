import React, { forwardRef } from "react";

import { classNames } from "@sparkle/lib/utils";

const sizeInputClasses = {
  sm: "s-text-base s-rounded-md s-py-1.5 s-pl-4 s-pr-8",
  md: "s-text-lg s-rounded-lg s-py-2 s-pl-4 s-pr-10",
};

type InputProps = {
  placeholder: string;
  size?: "sm" | "md";
  value: string | null;
  onChange?: (value: string) => void;
  error?: string | null;
  showErrorLabel?: boolean;
  name: string;
  isPassword?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  maxLength?: number;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      placeholder,
      value,
      size = "sm",
      onChange,
      error,
      showErrorLabel = false,
      name,
      isPassword = false,
      disabled = false,
      className = "",
      label,
      maxLength,
    },
    ref
  ) => {
    return (
      <div className="s-flex s-flex-col s-gap-1 s-p-px">
        {label && (
          <label
            htmlFor={name}
            className="s-pb-1 s-text-sm s-font-medium s-text-element-700 dark:s-text-element-700-dark"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          type={isPassword ? "password" : "text"}
          name={name}
          id={name}
          maxLength={maxLength}
          className={classNames(
            "s-w-full s-border-0 s-outline-none s-ring-1 focus:s-outline-none focus:s-ring-2",
            "s-bg-structure-50 s-placeholder-element-700",
            "dark:s-bg-structure-50-dark dark:s-placeholder-element-700-dark",
            sizeInputClasses[size],
            "s-transition-all s-duration-300 s-ease-out",
            className ?? "",
            !error
              ? classNames(
                  "s-ring-structure-200 focus:s-ring-action-300",
                  "dark:s-ring-structure-300-dark dark:focus:s-ring-action-300-dark"
                )
              : classNames(
                  "s-ring-warning-200 focus:s-ring-warning-300",
                  "dark:s-ring-warning-200-dark dark:focus:s-ring-warning-300-dark"
                ),
            disabled
              ? "s-text-element-500 hover:s-cursor-not-allowed"
              : "s-text-element-900 dark:s-text-element-800-dark"
          )}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => {
            onChange?.(e.target.value);
          }}
          data-1p-ignore={!isPassword}
          disabled={disabled}
        />
        <div className="s-ml-2 s-text-sm s-text-warning-500">
          {showErrorLabel && error ? error : null}
        </div>
      </div>
    );
  }
);

Input.displayName = "Input";
