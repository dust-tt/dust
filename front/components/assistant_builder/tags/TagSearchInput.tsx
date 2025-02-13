import {
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  ScrollArea,
  SearchInput,
} from "@dust-tt/sparkle";
import type { DataSourceTag } from "@dust-tt/types";
import React from "react";
import { useRef } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    const preventSelection = () => {
      const len = input.value.length;
      requestAnimationFrame(() => {
        input.setSelectionRange(len, len);
      });
    };

    input.addEventListener("focus", preventSelection);
    return () => input.removeEventListener("focus", preventSelection);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full" ref={containerRef}>
        <SearchInput
          name="tag-search"
          ref={inputRef}
          value={searchInputValue}
          onChange={(value) => setSearchInputValue(value)}
          onKeyDown={(e) => {
            if (
              (e.key === "Backspace" && !searchInputValue) ||
              e.key === "Escape"
            ) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
          placeholder="Search labels..."
          className="w-full"
          isLoading={isLoading}
          disabled={disabled}
        />
        <DropdownMenu
          open={
            availableTags.length > 0 ||
            (searchInputValue.length > 0 && !isLoading)
          }
        >
          <DropdownMenuTrigger asChild>
            <div className="absolute h-0 w-0 p-0" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent align="start">
              <ScrollArea>
                {availableTags.length > 0 ? (
                  availableTags.map((tag, i) => (
                    <DropdownMenuItem
                      key={`${tag.tag}-${i}`}
                      label={tag.tag}
                      onClick={() => {
                        onTagAdd(tag);
                        setSearchInputValue("");
                        inputRef.current?.focus();
                      }}
                    />
                  ))
                ) : (
                  <DropdownMenuItem label="No results" disabled />
                )}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>

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
