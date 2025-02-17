import {
  Button,
  Chip,
  cn,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  ScrollBar,
  SearchInput,
} from "@dust-tt/sparkle";
import type { DataSourceTag } from "@dust-tt/types";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import React, { forwardRef } from "react";

export interface TagSearchProps {
  searchInputValue: string;
  setSearchInputValue: (search: string) => void;
  availableTags: DataSourceTag[];
  selectedTags: DataSourceTag[];
  onTagAdd: (tag: DataSourceTag) => void;
  onTagRemove: (tag: DataSourceTag) => void;
  tagChipColor?: "slate" | "red";
  isLoading: boolean;
  disabled?: boolean;
}

export const TagSearchInput = ({
  searchInputValue,
  setSearchInputValue,
  availableTags,
  selectedTags,
  onTagAdd,
  onTagRemove,
  tagChipColor = "slate",
  isLoading,
  disabled = false,
}: TagSearchProps) => {
  return (
    <div className="flex flex-col gap-3">
      <SearchInputWithPopover
        name="tag-search"
        placeholder="Search labels..."
        value={searchInputValue}
        onChange={(value) => setSearchInputValue(value)}
        open={
          availableTags.length > 0 ||
          (searchInputValue.length > 0 && !isLoading)
        }
        onOpenChange={(open) => {
          if (!open) {
            setSearchInputValue("");
          }
        }}
        isLoading={isLoading}
        disabled={disabled}
      >
        <div className="flex flex-col gap-2 pr-4">
          {availableTags.length > 0 ? (
            availableTags.map((tag, i) => (
              <Button
                key={`${tag.tag}-${i}`}
                variant="ghost"
                label={tag.tag}
                size="sm"
                className="justify-start"
                onClick={() => {
                  onTagAdd(tag);
                  setSearchInputValue("");
                }}
              />
              // <div
              //   key={`${tag.tag}-${i}`}
              //   className="cursor-pointer py-2 hover:bg-primary-100 dark:hover:bg-primary-100-night"
              //   onClick={() => {
              //     onTagAdd(tag);
              //     setSearchInputValue("");
              //   }}
              // >
              //   {tag.tag}
              // </div>
            ))
          ) : (
            <Button
              variant="ghost"
              size="sm"
              label="No results found"
              disabled
            />
          )}
        </div>
      </SearchInputWithPopover>

      <div className="flex flex-wrap gap-2">
        {selectedTags.map((tag, i) => (
          <Chip
            key={`${tag.tag}-${i}`}
            label={tag.tag}
            onRemove={() => onTagRemove(tag)}
            color={tagChipColor}
            size="xs"
          />
        ))}
      </div>
    </div>
  );
};

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
          mountPortal={false}
          className={cn(
            "w-[--radix-popover-trigger-width] rounded-lg border bg-background shadow-md dark:bg-background-night",
            contentClassName
          )}
          sideOffset={0}
          style={{ pointerEvents: "all" }}
          align="start"
          id="search-popover-content"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => onOpenChange(false)}
        >
          <ScrollArea
            className="max-h-72"
            style={{
              position: "relative",
              height: "288px", // 72 * 4px (Tailwind's default)
            }}
          >
            <ScrollAreaPrimitive.Viewport
              className="h-full w-full"
              style={{
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {children}
            </ScrollAreaPrimitive.Viewport>
            <ScrollBar className="py-0" />
          </ScrollArea>
        </PopoverContent>
      </PopoverRoot>
    );
  }
);

SearchInputWithPopover.displayName = "SearchInputWithPopover";
