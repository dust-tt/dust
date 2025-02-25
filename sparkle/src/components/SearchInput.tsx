import React, { forwardRef, Ref, useEffect, useRef, useState } from "react";

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

type SearchInputWithPopoverBaseProps<T> = SearchInputProps & {
  contentClassName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  items: T[];
  renderItem: (item: T, selected: boolean) => React.ReactNode;
  onItemSelect?: (item: T) => void;
  noResults?: string;
  isLoading?: boolean;
};

function BaseSearchInputWithPopover<T>(
  {
    items,
    renderItem,
    onItemSelect,
    contentClassName,
    className,
    open,
    onOpenChange,
    value,
    onChange,
    mountPortal,
    mountPortalContainer,
    noResults,
    isLoading,
    ...searchInputProps
  }: SearchInputWithPopoverBaseProps<T>,
  ref: Ref<HTMLInputElement>
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current = new Array(items.length).fill(null);
  }, [items.length]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) {
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((current) => {
          const newIndex = (current - 1 + items.length) % items.length;
          itemRefs.current[newIndex]?.scrollIntoView({ block: "nearest" });
          return newIndex;
        });
        break;
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((current) => {
          const newIndex = (current + 1) % items.length;
          itemRefs.current[newIndex]?.scrollIntoView({ block: "nearest" });
          return newIndex;
        });
        break;
      case "Enter":
        e.preventDefault();
        onOpenChange(false);
        if (items[selectedIndex] && onItemSelect) {
          onItemSelect(items[selectedIndex]);
        }
        break;
    }
  };

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
          onKeyDown={handleKeyDown}
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
        fullWidth={true}
        align="start"
        id="search-popover-content"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={() => onOpenChange(false)}
        mountPortal={mountPortal}
        mountPortalContainer={mountPortalContainer}
      >
        <ScrollArea
          role="listbox"
          className="s-flex s-max-h-72 s-flex-col"
          hideScrollBar
        >
          {items.length > 0 ? (
            items.map((item, index) => (
              <div key={index} ref={(el) => (itemRefs.current[index] = el)}>
                {renderItem(item, selectedIndex === index)}
              </div>
            ))
          ) : isLoading ? (
            <div className="s-flex s-justify-center s-py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <div className="s-p-2 s-text-sm s-text-gray-500">
              {noResults ?? ""}
            </div>
          )}
          <ScrollBar className="s-py-0" />
        </ScrollArea>
      </PopoverContent>
    </PopoverRoot>
  );
}

export const SearchInputWithPopover = forwardRef(
  BaseSearchInputWithPopover
) as <T>(
  props: SearchInputWithPopoverBaseProps<T> & { ref?: Ref<HTMLInputElement> }
) => ReturnType<typeof BaseSearchInputWithPopover>;
