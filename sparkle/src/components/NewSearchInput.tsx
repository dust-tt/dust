import React, { forwardRef } from "react";

import { Icon } from "@sparkle/components/Icon";
import { MagnifyingGlassStrokeIcon, XMarkIcon } from "@sparkle/icons";
import { classNames, cn } from "@sparkle/lib/utils";

import { IconButton } from "./IconButton";
import { NewInput } from "./NewInput";

interface NewSearchInputProps {
  placeholder?: string;
  value: string | null;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  name: string;
  disabled?: boolean;
  className?: string;
}

export const NewSearchInput = forwardRef<HTMLInputElement, NewSearchInputProps>(
  (
    {
      placeholder = "Search",
      value,
      onChange,
      onKeyDown,
      name,
      disabled = false,
      className,
    },
    ref
  ) => {
    const clearInputField = () => {
      onChange?.("");
    };

    return (
      <div className={cn("s-relative s-m-px s-flex-grow", className)}>
        <NewInput
          type="text"
          name={name}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => {
            onChange?.(e.target.value);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          ref={ref}
        />
        <div
          className={classNames(
            "s-absolute s-inset-y-0 s-right-0 s-flex s-items-center s-pr-3"
          )}
        >
          {value && onChange ? (
            <IconButton
              icon={XMarkIcon}
              variant="secondary"
              size="sm"
              onClick={clearInputField}
            />
          ) : (
            <div
              className={classNames(
                disabled ? "s-text-element-600" : "s-text-element-900"
              )}
            >
              <Icon visual={MagnifyingGlassStrokeIcon} size="sm" />
            </div>
          )}
        </div>
      </div>
    );
  }
);

NewSearchInput.displayName = "NewSearchInput";
