/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import {
  Button,
  ContentMessage,
  Icon,
  Input,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  ScrollBar,
  Spinner,
} from "@sparkle/components";
import type { ContentMessageProps } from "@sparkle/components/ContentMessage";
import {
  ListCheckIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import React, {
  forwardRef,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";

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
      <div className={cn("s-relative", className)}>
        <Input
          type="text"
          name={name}
          autoComplete="off"
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
                  ? "s-text-muted-foreground dark:s-text-muted-foreground-night"
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
  availableHeight?: boolean;
  items: T[];
  renderItem: (item: T, selected: boolean) => React.ReactNode;
  onItemSelect?: (item: T) => void;
  onSelectAll?: () => void;
  noResults?: string;
  isLoading?: boolean;
  contentMessage?: ContentMessageProps;
  displayItemCount?: boolean;
  totalItems?: number;
  stickyTopContent?: React.ReactNode;
  stickyBottomContent?: React.ReactNode;
};

function BaseSearchInputWithPopover<T>(
  {
    items,
    renderItem,
    onItemSelect,
    onSelectAll,
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
    contentMessage,
    displayItemCount = false,
    totalItems,
    stickyTopContent,
    stickyBottomContent,
    availableHeight = false,
    ...searchInputProps
  }: SearchInputWithPopoverBaseProps<T>,
  ref: Ref<HTMLInputElement>
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const showHeader =
    Boolean(stickyTopContent) ||
    (items.length > 0 && (displayItemCount || onSelectAll));
  const showBottom = Boolean(stickyBottomContent);

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
          "s-w-[--radix-popover-trigger-width] s-rounded-lg s-border s-bg-background s-shadow-lg dark:s-bg-background-night",
          availableHeight &&
            "s-max-h-[var(--radix-popover-content-available-height)] s-overflow-hidden",
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
        <div
          className={cn("s-flex s-flex-col", availableHeight && "s-max-h-full")}
        >
          <ScrollArea
            className={cn(
              "s-flex s-flex-col s-rounded-lg",
              availableHeight
                ? "s-max-h-[calc(var(--radix-popover-content-available-height)-12px)] s-min-h-0 s-flex-1"
                : "s-max-h-72"
            )}
            hideScrollBar
          >
            {showHeader && (
              <div
                className={cn(
                  "s-sticky s-top-0 s-z-10 s-flex s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-bg-background/80 s-p-2 s-backdrop-blur-sm dark:s-border-border-night dark:s-bg-background-night"
                )}
              >
                <div className="s-flex s-flex-1 s-items-center s-gap-2">
                  {stickyTopContent}
                  {displayItemCount && items.length > 0 && (
                    <span className="s-text-sm s-text-gray-500">
                      {items.length} search results
                      {totalItems && ` (out of ${totalItems})`}.
                    </span>
                  )}
                </div>
                {onSelectAll && items.length > 0 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={onSelectAll}
                    label="Select all"
                    icon={ListCheckIcon}
                  />
                )}
              </div>
            )}
            <div role="listbox" className="s-flex s-flex-col">
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
                <div className="s-p-4 s-text-center s-text-sm s-italic s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {noResults ?? ""}
                </div>
              )}
            </div>
            {showBottom && (
              <div
                className={cn(
                  "s-sticky s-bottom-0 s-z-10 s-flex s-items-center s-justify-between s-gap-2 s-border-t s-border-border s-bg-background/80 s-p-2 s-backdrop-blur-sm dark:s-border-border-night dark:s-bg-background-night"
                )}
              >
                {stickyBottomContent}
              </div>
            )}
            <ScrollBar className="s-py-0" />
          </ScrollArea>
          {contentMessage && (
            <div className="s-p-1">
              <ContentMessage {...contentMessage} />
            </div>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

export const SearchInputWithPopover = forwardRef(
  BaseSearchInputWithPopover
) as <T>(
  props: SearchInputWithPopoverBaseProps<T> & { ref?: Ref<HTMLInputElement> }
) => ReturnType<typeof BaseSearchInputWithPopover>;
