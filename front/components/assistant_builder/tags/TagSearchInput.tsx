import {
  Chip,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  SearchDropdownMenu,
  Spinner,
} from "@dust-tt/sparkle";

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
      <SearchDropdownMenu
        searchInputValue={searchInputValue}
        setSearchInputValue={setSearchInputValue}
        disabled={disabled}
      >
        {availableTags.length > 0 ? (
          <DropdownMenuTagList>
            {availableTags.map((tag) => (
              <div
                key={tag.tag}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <DropdownMenuTagItem
                  label={tag.tag}
                  onClick={() => {
                    onTagAdd(tag);
                    setSearchInputValue("");
                  }}
                />
              </div>
            ))}
          </DropdownMenuTagList>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <div className="p-2 text-sm text-gray-500">No results found</div>
        )}
      </SearchDropdownMenu>
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
