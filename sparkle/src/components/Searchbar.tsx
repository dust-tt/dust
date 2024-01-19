import React from "react";

import { Icon } from "@sparkle/components/Icon";
import { classNames } from "@sparkle/lib/utils";

import { MagnifyingGlassStrokeIcon, XMarkIcon } from "..";
import { IconButton } from "./IconButton";

const sizeClasses = {
  xs: "s-text-xs s-h-[26px] s-pl-3 s-pr-6 s-pt-1.5",
  sm: "s-text-sm s-h-[34px] s-pl-4 s-pr-8 s-pt-1.5",
  md: "s-text-base s-h-[46px] s-pl-6 s-pr-10 s-pt-1.5",
};
const iconClasses = {
  xs: "s-pr-2",
  sm: "s-pr-3",
  md: "s-pr-4",
};

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
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const clearInputField = () => {
    onChange?.("");
  };

  return (
    <div className="s-relative s-m-px">
      <input
        type="text"
        name={name}
        id={name}
        className={classNames(
          "s-border-0 s-outline-none s-ring-1 s-ring-structure-200 focus:s-outline-none focus:s-ring-2",
          "s-w-full s-rounded-full s-bg-structure-50 s-font-normal s-placeholder-element-600",
          "s-ring-structure-200 focus:s-ring-action-300",
          "dark:s-ring-structure-300-dark dark:focus:s-ring-action-300-dark",
          "s-transition-all s-duration-300 s-ease-out",
          sizeClasses[size],
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
      <div
        className={classNames(
          "s-absolute s-right-0 s-top-0 s-flex s-h-full s-items-center",
          iconClasses[size]
        )}
      >
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
