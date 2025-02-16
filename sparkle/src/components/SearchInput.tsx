import React, { forwardRef } from "react";

import {
  Button,
  Icon,
  Input,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  ScrollBar,
  Spinner,
} from "@sparkle/components";
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

export interface SearchInputWithPopoverProps extends SearchInputProps {
  children: React.ReactNode;
  contentClassName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SearchInputWithPopover = forwardRef<
  HTMLInputElement,
  SearchInputWithPopoverProps
>(
  (
    {
      children,
      contentClassName,
      className,
      open,
      onOpenChange,
      value,
      onChange,
      ...searchInputProps
    },
    ref
  ) => {
    return (
      <PopoverRoot modal={false} open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <SearchInput
            ref={ref}
            className={cn("s-w-full", className)}
            value={value}
            onChange={(newValue) => {
              onChange?.(newValue);
              if (newValue && !open) {
                onOpenChange(true);
              }
            }}
            {...searchInputProps}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls="search-popover-content"
          />
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "s-w-[--radix-popover-trigger-width] s-rounded-lg s-border s-bg-background s-shadow-md dark:s-bg-background-night",
            contentClassName
          )}
          sideOffset={0}
          align="start"
          id="search-popover-content"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => onOpenChange(false)}
        >
          <ScrollArea
            role="listbox"
            className="s-flex s-max-h-72 s-flex-col"
            hideScrollBar
          >
            {children}
            <ScrollBar className="py-0" />
          </ScrollArea>
        </PopoverContent>
      </PopoverRoot>
    );
  }
);

SearchInputWithPopover.displayName = "SearchInputWithPopover";
