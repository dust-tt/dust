import { Button, SearchInput, XMarkIcon } from "@dust-tt/sparkle";
import type { SelectedTag } from "@dust-tt/types";
import { useRef } from "react";

export interface TagSearchProps {
  searchInputValue: string;
  setSearchInputValue: (search: string) => void;
  availableTags: SelectedTag[];
  selectedTags: SelectedTag[];
  onTagAdd: (tag: SelectedTag) => void;
  onTagRemove: (tag: SelectedTag) => void;
  placeholder?: string;
  isLoading: boolean;
}

export const TagSearch = ({
  searchInputValue,
  setSearchInputValue,
  availableTags,
  selectedTags,
  onTagAdd,
  onTagRemove,
  isLoading,
  placeholder = "Search tags...",
}: TagSearchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showDropdown = availableTags.length > 0;

  // @todo handle loading state
  console.log(isLoading);

  return (
    <div className="flex flex-col gap-3" ref={containerRef}>
      <div className="w-full">
        <SearchInput
          name="tag-search"
          ref={inputRef}
          value={searchInputValue}
          onChange={(value) => setSearchInputValue(value)}
          placeholder={placeholder}
          className="w-full"
        />
      </div>

      {showDropdown && (
        <div
          className="absolute mt-[40px] w-full rounded-md border bg-white p-1 shadow-md"
          style={{
            width: containerRef.current?.offsetWidth,
          }}
        >
          {availableTags.length > 0 ? (
            availableTags.map((tag) => (
              <Button
                key={`${tag.tag}-${tag.dustAPIDataSourceId}`} // todo not expose dustAPIDataSourceId
                variant="ghost"
                label={tag.tag}
                onClick={() => onTagAdd(tag)}
                className="w-full justify-start"
              />
            ))
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No matching tags
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {selectedTags.map((tag) => (
          <Button
            key={`${tag.tag}-${tag.dustAPIDataSourceId}`} // todo not expose dustAPIDataSourceId
            label={tag.tag}
            onClick={() => onTagRemove(tag)}
            variant="outline"
            icon={XMarkIcon}
          />
        ))}
      </div>
    </div>
  );
};
