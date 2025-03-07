import { Label } from "@dust-tt/sparkle";
import type {
  DataSourceTag,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import { TagSearchInput } from "@app/components/assistant_builder/tags/TagSearchInput";
import { useDataSourceViewSearchTags } from "@app/lib/swr/data_source_views";

interface TagSearchSectionProps {
  dataSourceViews: DataSourceViewType[];
  label: string;
  onTagAdd: (tag: DataSourceTag) => void;
  onTagRemove: (tag: DataSourceTag) => void;
  operation: "in" | "not";
  owner: LightWorkspaceType;
  selectedTagsIn: DataSourceTag[];
  selectedTagsNot: DataSourceTag[];
}

export function TagSearchSection({
  dataSourceViews,
  label,
  onTagAdd,
  onTagRemove,
  operation,
  owner,
  selectedTagsIn,
  selectedTagsNot,
}: TagSearchSectionProps) {
  const [searchInputValue, setSearchInputValue] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [availableTags, setAvailableTags] = useState<DataSourceTag[]>([]);

  const { tags: rawTags, isLoading } = useDataSourceViewSearchTags({
    owner,
    query: debouncedQuery,
    dataSourceViews,
  });

  // Process raw tags to filter out selected ones and format them.
  useEffect(() => {
    if (!rawTags) {
      return;
    }

    const formattedTags: DataSourceTag[] = [];
    for (const tag of rawTags) {
      for (const dataSourceId of tag.data_sources) {
        const isTagUsed =
          selectedTagsIn.some(
            (t) => t.tag === tag.tag && t.dustAPIDataSourceId === dataSourceId
          ) ||
          selectedTagsNot.some(
            (t) => t.tag === tag.tag && t.dustAPIDataSourceId === dataSourceId
          );

        if (!isTagUsed) {
          formattedTags.push({
            tag: tag.tag,
            dustAPIDataSourceId: dataSourceId,
            connectorProvider: null,
          });
        }
      }
    }

    setAvailableTags(formattedTags);
  }, [rawTags, selectedTagsIn, selectedTagsNot]);

  // Debounce the search input.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInputValue) {
        setDebouncedQuery(searchInputValue);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInputValue]);

  const handleSearchInputChange = (value: string) => {
    setSearchInputValue(value);
    if (!value.trim()) {
      setAvailableTags([]);
      setDebouncedQuery("");
    }
  };

  // Map operation to the appropriate tag color.
  const tagChipColor = operation === "in" ? "slate" : "red";

  // Select the appropriate tags based on operation.
  const selectedTags = operation === "in" ? selectedTagsIn : selectedTagsNot;

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <TagSearchInput
        searchInputValue={searchInputValue}
        setSearchInputValue={handleSearchInputChange}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onTagAdd={onTagAdd}
        onTagRemove={onTagRemove}
        tagChipColor={tagChipColor}
        isLoading={isLoading}
      />
    </div>
  );
}
