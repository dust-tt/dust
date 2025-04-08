import { Chip, cn, SearchInputWithPopover } from "@dust-tt/sparkle";
import React from "react";

import type { DataSourceTag } from "@app/types";

export interface TagSearchProps {
  searchInputValue: string;
  setSearchInputValue: (search: string) => void;
  availableTags: DataSourceTag[];
  selectedTags: DataSourceTag[];
  onTagAdd: (tag: DataSourceTag) => void;
  onTagRemove: (tag: DataSourceTag) => void;
  tagChipColor?: "primary" | "warning";
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
  tagChipColor = "primary",
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
        open={availableTags.length > 0 || searchInputValue.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setSearchInputValue("");
          }
        }}
        isLoading={isLoading}
        disabled={disabled}
        noResults="No results found"
        items={availableTags}
        onItemSelect={(item) => {
          onTagAdd(item);
          setSearchInputValue("");
        }}
        renderItem={(item, selected) => (
          <div
            className={cn(
              "copy-sm m-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-background dark:hover:bg-background-night",
              selected && "bg-background dark:bg-background-night"
            )}
            onClick={() => {
              onTagAdd(item);
              setSearchInputValue("");
            }}
          >
            <strong>{item.tag}</strong>
          </div>
        )}
      ></SearchInputWithPopover>

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
