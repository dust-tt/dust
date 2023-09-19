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
          "s-w-full s-rounded-md",
          className ?? "",
          !error
            ? "focus:ring-action-500 s-border-gray-300 focus:s-border-action-500"
            : "focus:border-red-500 focus:ring-red-500 s-border-red-500",
          "s-bg-structure-50 s-stroke-structure-50"
        )}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          onChange?.(e.target.value);
        }}
        data-1p-ignore={!isPassword}
        disabled={disabled}
      />
      <div className="s-ml-2 s-h-4 s-text-red-500">
        {showErrorLabel && error ? error : null}
      </div>
    </div>
  );
}
