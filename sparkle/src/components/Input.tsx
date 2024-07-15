import React from "react";

import { classNames } from "@sparkle/lib/utils";

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
};

const sizeInputClasses = {
  sm: "s-text-base s-rounded-md s-py-1.5 s-pl-4 s-pr-8",
  md: "s-text-lg s-rounded-lg s-py-2 s-pl-4 s-pr-10",
};

export function Input({
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
}: InputProps) {
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
        type={isPassword ? "password" : "text"}
        name={name}
        id={name}
        className={classNames(
          "s-w-full s-border-0 s-outline-none s-ring-1 focus:s-outline-none focus:s-ring-2",
          "s-bg-structure-50 s-text-element-900 s-placeholder-element-700",
          "dark:s-bg-structure-50-dark dark:s-text-element-800-dark dark:s-placeholder-element-700-dark",
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
              )
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
