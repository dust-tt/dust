import React, { forwardRef } from "react";

import { Icon, Input, NewButton } from "@sparkle/components";
import { MagnifyingGlassIcon, XMarkIcon } from "@sparkle/icons";
import { classNames, cn } from "@sparkle/lib/utils";

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
        <Input
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
            "s-absolute s-inset-y-0 s-right-0 -s-mt-1 s-flex s-items-center s-pr-2"
          )}
        >
          {value && onChange ? (
            <NewButton
              icon={XMarkIcon}
              variant="ghost"
              size="xs"
              onClick={clearInputField}
            />
          ) : (
            <div
              className={classNames(
                "s-px-2",
                disabled ? "s-text-element-600" : "s-text-element-900"
              )}
            >
              <Icon
                visual={MagnifyingGlassIcon}
                size="xs"
                className="s-text-muted-foreground"
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

NewSearchInput.displayName = "NewSearchInput";
