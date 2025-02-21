import { Button, Chip, cn, SearchInputWithPopover } from "@dust-tt/sparkle";
import type { DataSourceTag } from "@dust-tt/types";
import React from "react";

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
        noResults="No results found"
        items={availableTags}
        renderItem={(item, selected) => (
          <Button
            key={`${item.tag}`}
            variant="ghost"
            label={item.tag}
            size="sm"
            className={cn(
              "justify-start",
              selected &&
                "border-border-dark bg-primary-150 text-primary-900 dark:border-primary-600 dark:bg-primary-700 dark:text-primary-900-night"
            )}
            onClick={() => {
              onTagAdd(item);
              setSearchInputValue("");
            }}
          />
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
