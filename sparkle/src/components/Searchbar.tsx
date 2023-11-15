import React from "react";

import { Icon } from "@sparkle/components/Icon";
import { classNames } from "@sparkle/lib/utils";

import { MagnifyingGlassStrokeIcon, XMarkIcon } from "..";
import { IconButton } from "./IconButton";

export function Searchbar({
  placeholder,
  value,
  onChange,
  onKeyDown,
  name,
  size = "sm",
  disabled = false,
  className = "",
}: {
  placeholder: string;
  value: string | null;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  name: string;
  size?: "xs" | "sm";
  disabled?: boolean;
  className?: string;
}) {
  const clearInputField = () => {
    onChange?.("");
  };

  return (
    <div className="s-relative">
      <input
        type="text"
        name={name}
        id={name}
        className={classNames(
          "s-border-0 s-outline-none s-ring-1 s-ring-structure-200 focus:s-outline-none focus:s-ring-2",
          "s-w-full s-rounded-full s-bg-structure-50 s-font-normal s-placeholder-element-600",
          "s-ring-structure-200 focus:s-ring-action-300",
          "dark:s-ring-structure-300-dark dark:focus:s-ring-action-300-dark",
          size === "sm" ? "s-text-base" : "s-text-sm",
          size === "sm" ? "s-py-1.5 s-pl-4 s-pr-8" : "s-py-1 s-pl-4 s-pr-8",
          "s-transition-all s-duration-300 s-ease-out",
          className ?? "",
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
            size={size}
            onClick={clearInputField}
          />
        ) : (
          <div
            className={classNames(
              disabled ? "s-text-element-600" : "s-text-element-900"
            )}
          >
            <Icon visual={MagnifyingGlassStrokeIcon} size={size} />
          </div>
        )}
      </div>
    </div>
  );
}
