import React from "react";

import { classNames } from "@sparkle/lib/utils";

export function Input({
  placeholder,
  value,
  onChange,
  error,
  showErrorLabel = false,
  name,
  isPassword = false,
  disabled = false,
  className = "",
}: {
  placeholder: string;
  value: string | null;
  onChange?: (value: string) => void;
  error?: string | null;
  showErrorLabel?: boolean;
  name: string;
  isPassword?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="s-flex s-flex-col s-gap-1 s-p-px">
      <input
        type={isPassword ? "password" : "text"}
        name={name}
        id={name}
        className={classNames(
          "s-border-0 s-text-base s-outline-none s-ring-1 focus:s-outline-none focus:s-ring-2",
          "s-bg-structure-50 s-text-element-900 s-placeholder-element-600",
          "dark:s-bg-structure-50-dark dark:s-text-element-800-dark dark:s-placeholder-element-600-dark",
          "s-w-full s-rounded-md s-py-1.5 s-pl-4 s-pr-8",
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
