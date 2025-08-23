import React from "react";
import { useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { SearchInput } from "@sparkle/components/SearchInput";

type SearchDropdownMenuProps = {
  searchInputValue: string;
  setSearchInputValue: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  minLengthToOpen?: number;
};

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
              const firstItem = document.querySelector(
                '[data-radix-menu-content][data-state=open] [role="menuitem"]'
              );
              if (firstItem instanceof HTMLElement) {
                firstItem.click();
              }
              setIsOpen(false);
            }
            if (e.key === "Tab" || e.key === "ArrowDown") {
              e.preventDefault();
              const firstItem = document.querySelector(
                '[data-radix-menu-content][data-state=open] [role="menuitem"]'
              );
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
        className="s-w-[--radix-popper-anchor-width]"
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
