import { Button } from "@sparkle/components/Button";
import type { ContentMessageProps } from "@sparkle/components/ContentMessage";
import { ContentMessage } from "@sparkle/components/ContentMessage";
import { Icon } from "@sparkle/components/Icon";
import { Input } from "@sparkle/components/Input";
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@sparkle/components/Popover";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { Spinner } from "@sparkle/components/Spinner";
import { CheckDone01, SearchMd, XClose } from "@sparkle/icons/v2-stroke";
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
  /** Called with the raw string value (not a DOM event) on every change; called with "" when the clear button is pressed. */
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  id?: string;
  name: string;
  disabled?: boolean;
  /** Replaces the trailing icon with a small spinner while results are being fetched. */
  isLoading?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md";
}

/**
 * A search-specific text field with a built-in search icon and clear affordance, wired
 * through a simplified `value` / `onChange` (string) contract. Use it for freeform search
 * or filter input; `onChange` receives the raw string value, so manage the query in state
 * directly. For generic short text or number entry use `Input`; for multi-line input use
 * `TextArea`; to surface live results inline, use `SearchInputWithPopover`.
 *
 * @summary Search text field with clear affordance.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      placeholder = "Search",
      id,
      value,
      onChange,
      onKeyDown,
      onFocus,
      onBlur,
      name,
      disabled = false,
      isLoading = false,
      className,
      size = "sm",
    },
    ref
  ) => {
    const clearInputField = () => {
      onChange("");
    };

    const inputId = id ?? name;
    // Mirror the Button size -> icon size scale (see ICON_SIZE_MAP in Button).
    const iconSize = size === "md" ? "md" : size === "sm" ? "sm" : "xs";
    // Align the trailing icon with the Input horizontal padding (see
    // sizeVariantStyles in Input) so it sits flush with the text padding.
    const iconPadding =
      size === "md" ? "px-3" : size === "sm" ? "px-2" : "px-1.5";

    return (
      <div className={cn("relative", className)}>
        <Input
          id={inputId}
          type="text"
          name={name}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          size={size}
          ref={ref}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
          {isLoading ? (
            <div className="px-1">
              <Spinner size={iconSize} />
            </div>
          ) : value ? (
            <Button
              icon={XClose}
              variant="ghost"
              size={size === "md" ? "sm" : "xs"}
              onClick={clearInputField}
            />
          ) : (
            <div
              className={cn(
                iconPadding,
                disabled ? "text-muted-foreground" : "text-foreground"
              )}
            >
              <Icon
                visual={SearchMd}
                size={iconSize}
                className="text-muted-foreground"
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
  /** Controls whether the results popover is open. */
  open: boolean;
  /** Called when the popover requests to open or close (typing, selection, outside click). */
  onOpenChange: (open: boolean) => void;
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  /** Sizes the popover to the available viewport height instead of a fixed `maxHeight`. */
  availableHeight?: boolean;
  /** Maximum height of the results list when `availableHeight` is not set. */
  maxHeight?: "sm" | "md" | "lg" | "xl";
  items: T[];
  /** Renders one result row; `selected` is true for the keyboard-highlighted item. */
  renderItem: (item: T, selected: boolean) => React.ReactNode;
  /** Called when a result is chosen by click or Enter. */
  onItemSelect?: (item: T) => void;
  /** When provided, shows a "Select all" button in the sticky header. */
  onSelectAll?: () => void;
  /** Message shown when `items` is empty and not loading. */
  noResults?: string;
  isLoading?: boolean;
  /** Optional `ContentMessage` rendered below the results list. */
  contentMessage?: ContentMessageProps;
  /** Shows a "N search results" count in the sticky header. */
  displayItemCount?: boolean;
  /** Total result count, displayed alongside the item count as "(out of N)". */
  totalItems?: number;
  /** Content pinned above the results list. */
  stickyTopContent?: React.ReactNode;
  /** Content pinned below the results list. */
  stickyBottomContent?: React.ReactNode;
};

const MAX_HEIGHT_CLASSES = {
  sm: "max-h-48",
  md: "max-h-72",
  lg: "max-h-96",
  xl: "max-h-[40rem]",
} as const;

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
    maxHeight = "md",
    ...searchInputProps
  }: SearchInputWithPopoverBaseProps<T>,
  ref: Ref<HTMLInputElement>
) {
  // biome-ignore lint/correctness/useHookAtTopLevel: this is a forwardRef render function, Biome can't trace the forwardRef call
  const [selectedIndex, setSelectedIndex] = useState(0);
  // biome-ignore lint/correctness/useHookAtTopLevel: this is a forwardRef render function
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const showHeader =
    Boolean(stickyTopContent) ||
    (items.length > 0 && (displayItemCount || onSelectAll));
  const showBottom = Boolean(stickyBottomContent);

  // biome-ignore lint/correctness/useHookAtTopLevel: this is a forwardRef render function
  useEffect(() => {
    itemRefs.current = new Array(items.length).fill(null);
  }, [items.length]);

  // biome-ignore lint/correctness/useHookAtTopLevel: this is a forwardRef render function
  // biome-ignore lint/correctness/useExhaustiveDependencies: items is a prop, resetting index on change is intentional
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
          className={cn("w-full", className)}
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
          "w-(--radix-popover-trigger-width) rounded-lg border border-border bg-background shadow-lg",
          availableHeight &&
            "max-h-(--radix-popover-content-available-height) overflow-hidden",
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
          className={cn(
            "flex flex-col overflow-hidden rounded-lg",
            availableHeight && "max-h-full"
          )}
        >
          {showHeader && (
            <div
              className={cn(
                "z-10 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background p-2"
              )}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="flex flex-1 items-center gap-2">
                {stickyTopContent}
                {displayItemCount && items.length > 0 && (
                  <span className="text-sm text-muted-foreground">
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
                  icon={CheckDone01}
                />
              )}
            </div>
          )}
          <ScrollArea
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              availableHeight
                ? "max-h-[calc(var(--radix-popover-content-available-height)-12px)]"
                : MAX_HEIGHT_CLASSES[maxHeight]
            )}
            hideScrollBar
          >
            <div role="listbox" className="flex flex-col">
              {items.length > 0 ? (
                items.map((item, index) => (
                  <div
                    key={index}
                    ref={(el) => (itemRefs.current[index] = el)}
                    onClick={() => {
                      onOpenChange(false);
                      onItemSelect?.(item);
                    }}
                  >
                    {renderItem(item, selectedIndex === index)}
                  </div>
                ))
              ) : isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner variant="dark" size="md" />
                </div>
              ) : (
                <div className="p-4 text-center text-sm italic text-muted-foreground">
                  {noResults ?? ""}
                </div>
              )}
            </div>
            <ScrollBar className="py-0" />
          </ScrollArea>
          {showBottom && (
            <div
              className={cn(
                "z-10 hidden shrink-0 items-center justify-between gap-2 border-t border-border bg-background p-2 sm:flex"
              )}
            >
              {stickyBottomContent}
            </div>
          )}
          {contentMessage && (
            <div className="p-1">
              <ContentMessage {...contentMessage} />
            </div>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

/**
 * A `SearchInput` with an attached results dropdown offering keyboard navigation, custom
 * `renderItem`, an optional `onSelectAll`, sticky top/bottom content, item counts, and a
 * `noResults` state. Use it when search results should appear inline below the field;
 * handle selection via `onItemSelect`. For a plain field without results, use `SearchInput`.
 *
 * @summary Search field with results popover.
 */
export const SearchInputWithPopover = forwardRef(
  BaseSearchInputWithPopover
) as <T>(
  props: SearchInputWithPopoverBaseProps<T> & { ref?: Ref<HTMLInputElement> }
) => ReturnType<typeof BaseSearchInputWithPopover>;
