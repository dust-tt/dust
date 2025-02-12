import React, { forwardRef } from "react";

import { Button, Icon, Input, Spinner } from "@sparkle/components";
import { MagnifyingGlassIcon, XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

export interface SearchInputProps {
  placeholder?: string;
  value: string | null;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  name: string;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      placeholder = "Search",
      value,
      onChange,
      onKeyDown,
      onFocus,
      name,
      disabled = false,
      isLoading = false,
      className,
    },
    ref
  ) => {
    const clearInputField = () => {
      onChange("");
    };

    return (
      <div className={cn("s-relative s-flex-grow", className)}>
        <Input
          type="text"
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          disabled={disabled}
          ref={ref}
        />
        <div className="s-absolute s-inset-y-0 s-right-0 s-flex s-items-center s-pr-1">
          {isLoading ? (
            <div className="s-px-1">
              <Spinner size="xs" />
            </div>
          ) : value ? (
            <Button
              icon={XMarkIcon}
              variant="ghost"
              size="xs"
              onClick={clearInputField}
            />
          ) : (
            <div
              className={cn(
                "s-px-2",
                disabled
                  ? "s-text-element-600 dark:s-text-element-600-night"
                  : "s-text-foreground dark:s-text-foreground-night"
              )}
            >
              <Icon
                visual={MagnifyingGlassIcon}
                size="xs"
                className="s-text-muted-foreground dark:s-text-muted-foreground-night"
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
