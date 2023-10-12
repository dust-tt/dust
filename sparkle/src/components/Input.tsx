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
    <div className="flex flex-col">
      <input
        type={isPassword ? "password" : "text"}
        name={name}
        id={name}
        className={classNames(
          "s-border-0 s-outline-none s-ring-1 s-ring-structure-200 focus:s-outline-none focus:s-ring-2",
          "s-w-full s-rounded-md  s-bg-structure-50 s-py-1.5 s-pl-4 s-pr-8 s-placeholder-element-600",
          "s-transition-all s-duration-300 s-ease-out",
          "s-placeholder-element-600-dark  dark:s-bg-structure-50-dark dark:s-ring-structure-200-dark",
          className ?? "",
          !error
            ? "focus:s-ring-action-300"
            : "s-ring-red-200 focus:s-ring-red-200"
        )}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          onChange?.(e.target.value);
        }}
        data-1p-ignore={!isPassword}
        disabled={disabled}
      />
      <div className="s-ml-2 s-mt-1 s-text-sm s-text-warning-500">
        {showErrorLabel && error ? error : null}
      </div>
    </div>
  );
}
