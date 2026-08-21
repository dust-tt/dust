import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { SearchInput } from "@sparkle/components/SearchInput";
import React, { useRef, useState } from "react";

const OPEN_MENU_ITEM_SELECTOR = [
  '[data-radix-menu-content][data-state=open] [role="menuitem"]',
  '[data-radix-menu-content][data-state=open] [role="menuitemcheckbox"]',
  '[data-radix-menu-content][data-state=open] [role="menuitemradio"]',
].join(", ");

function getFirstOpenMenuItem(): HTMLElement | null {
  return document.querySelector<HTMLElement>(OPEN_MENU_ITEM_SELECTOR);
}

type SearchDropdownMenuProps = {
  /** Current text of the search input; the caller owns this state. */
  searchInputValue: string;
  /** Called with the new text on every input change. */
  setSearchInputValue: (value: string) => void;
  /** The result menu items rendered inside the dropdown content. */
  children: React.ReactNode;
  disabled?: boolean;
  /** Minimum query length before the results dropdown opens (default 1). */
  minLengthToOpen?: number;
};

/**
 * A search input that opens a dropdown of results while typing, keeping focus
 * in the field: Enter activates the first result, Tab or ArrowDown moves focus
 * into the list. Use it for search-as-you-type flows whose results are
 * rendered as dropdown menu items; for a static menu of actions, use Dropdown.
 * @summary Search input with results dropdown.
 */
export function SearchDropdownMenu({
  searchInputValue,
  setSearchInputValue,
  disabled,
  minLengthToOpen = 1,
  children,
}: SearchDropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <DropdownMenu
      open={isOpen && searchInputValue.length >= minLengthToOpen}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          setIsOpen(open);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <SearchInput
          ref={searchInputRef}
          name="search"
          placeholder="Search"
          className="w-full"
          value={searchInputValue}
          disabled={disabled}
          onFocus={() => {
            if (!isOpen) {
              setIsOpen(searchInputValue.length >= minLengthToOpen);
              setTimeout(() => {
                searchInputRef.current?.focus();
              }, 0);
            }
          }}
          onChange={(value) => {
            setSearchInputValue(value);
            setIsOpen(value.length >= minLengthToOpen);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const firstItem = getFirstOpenMenuItem();
              if (firstItem instanceof HTMLElement) {
                firstItem.click();
              }
              setIsOpen(false);
            }
            if (e.key === "Tab" || e.key === "ArrowDown") {
              e.preventDefault();
              const firstItem = getFirstOpenMenuItem();
              if (firstItem instanceof HTMLElement) {
                firstItem.focus();
              }
            }
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        className="w-(--radix-popper-anchor-width)"
        searchInputRef={searchInputRef}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        onFocusOutside={(e) => {
          // Prevent closing when search input is focused
          if (e.target === searchInputRef.current) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          // Prevent closing when clicking on the search input
          if (e.target === searchInputRef.current) {
            e.preventDefault();
          }
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
