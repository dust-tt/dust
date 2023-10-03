import React, { useRef } from "react";

import { Icon } from "@sparkle/components/Icon";
import { classNames } from "@sparkle/lib/utils";

import { MagnifyingGlassStrokeIcon, XMarkIcon } from "..";
import { IconButton } from "./IconButton";

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
  const clearInputField = () => {
    onChange?.("");
  };

  return (
    <div className="flex flex-col">
      <div
        className={classNames(
          "s-relative s-text-sm s-font-normal",
          disabled ? "s-text-element-600" : "s-text-element-900"
        )}
      >
        <input
          type="text"
          name={name}
          id={name}
          className={classNames(
            "s-border-0 s-outline-none s-ring-1 s-ring-structure-200 focus:s-outline-none focus:s-ring-2",
            "s-w-full s-rounded-full  s-bg-structure-50 s-py-1.5 s-pl-4 s-pr-8 s-placeholder-element-600",
            "s-transition-all s-duration-300 s-ease-out",
            className ?? "",
            !error
              ? "focus:s-ring-action-300"
              : "s-ring-red-200 focus:s-ring-red-200",
            disabled
              ? "s-cursor-default s-text-element-600"
              : "s-text-element-900"
          )}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => {
            onChange?.(e.target.value);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <div className="s-absolute s-right-0 s-top-0 s-flex s-h-full s-items-center s-pr-3">
          {value && onChange ? (
            <IconButton
              icon={XMarkIcon}
              variant="secondary"
              size="sm"
              onClick={clearInputField}
            />
          ) : (
            <Icon visual={MagnifyingGlassStrokeIcon} size="sm" />
          )}
        </div>
      </div>
      <div
        className={classNames(
          "s-ml-0.5 s-h-4 s-pl-2 s-pt-2 s-text-xs s-font-normal s-text-red-500",
          showErrorLabel ? "" : "hidden"
        )}
      >
        {showErrorLabel && error ? error : null}
      </div>
    </div>
  );
}
