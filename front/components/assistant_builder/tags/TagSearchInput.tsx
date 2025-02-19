import { Button, Chip, SearchInputWithPopover } from "@dust-tt/sparkle";
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
