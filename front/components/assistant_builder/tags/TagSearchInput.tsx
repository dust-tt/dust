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
}: TagSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
              <ScrollArea className="max-h-64">
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
                  <div className="px-2 py-1.5 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {!isLoading &&
                      availableTags.length === 0 &&
                      searchInputValue.length > 0 &&
                      "No labels found"}
                  </div>
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
