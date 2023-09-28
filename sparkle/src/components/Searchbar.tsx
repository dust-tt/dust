import React from "react";

import { MagnifyingGlass } from "@sparkle/icons/stroke";
import { classNames } from "@sparkle/lib/utils";

export function Searchbar({
  placeholder,
  value,
  onChange,
  onKeyDown,
  error,
  showErrorLabel = false,
  name,
  disabled = false,
  className = "",
}: {
  placeholder: string;
  value: string | null;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  error?: string | null;
  showErrorLabel?: boolean;
  name: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="s-relative s-text-sm s-font-medium s-text-element-800">
        <input
          type="text"
          name={name}
          id={name}
          className={classNames(
            "s-h-9 s-w-full s-rounded-full s-border-structure-200 s-pr-8",
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
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <MagnifyingGlass className="s-absolute s-right-3 s-top-2 s-h-5 s-w-5" />
      </div>
      <div
        className={classNames(
          "s-ml-2 s-h-4 s-text-red-500",
          showErrorLabel ? "" : "hidden"
        )}
      >
        {showErrorLabel && error ? error : null}
      </div>
    </div>
  );
}
