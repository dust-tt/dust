import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FilterIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceTag,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  WorkspaceType,
} from "@dust-tt/types";
import { useRef, useState } from "react";

import { getActionTags } from "@app/components/assistant_builder/tags/helpers";
import { TagSearchInput } from "@app/components/assistant_builder/tags/TagSearchInput";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useTagSearchEndpoint } from "@app/lib/swr/data_sources";
import { debounce } from "@app/lib/utils/debounce";

/**
 * Get the list of tags from the core API, ensuring that the tags are not already selected in the action.
 */
function useGetAvailableTags({
  owner,
  dustAPIDataSourceIds,
  selectedTagsIn,
  selectedTagsNot,
}: {
  owner: WorkspaceType;
  dustAPIDataSourceIds: string[];
  selectedTagsIn: DataSourceTag[];
  selectedTagsNot: DataSourceTag[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { searchTags } = useTagSearchEndpoint({ owner });

  const searchTagsInCoreAPI = async (query: string) => {
    setIsLoading(true);
    try {
      const tags = await searchTags({
        query,
        queryType: "prefix",
        dataSources: dustAPIDataSourceIds,
      });
      const formattedTags: DataSourceTag[] = [];
      for (const tag of tags) {
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
      return formattedTags;
    } catch (error) {
      console.error("Failed to search tags:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, searchTagsInCoreAPI };
}

/**
 * Handle the search input state logic.
 */
function useTagSearch() {
  const [searchInputValueIn, setSearchInputValueIn] = useState<string>("");
  const [searchInputValueNot, setSearchInputValueNot] = useState<string>("");
  const [availableTagsIn, setAvailableTagsIn] = useState<DataSourceTag[]>([]);
  const [availableTagsNot, setAvailableTagsNot] = useState<DataSourceTag[]>([]);
  const searchHandleIn = useRef<NodeJS.Timeout>();
  const searchHandleNot = useRef<NodeJS.Timeout>();

  const handleSearchInputChange =
    (searchTagsInCoreAPI: (query: string) => Promise<DataSourceTag[]>) =>
    (value: string, mode: "in" | "not") => {
      if (mode === "in") {
        setSearchInputValueIn(value);
      } else {
        setSearchInputValueNot(value);
      }
      if (value.trim()) {
        debounce(
          mode === "in" ? searchHandleIn : searchHandleNot,
          async () => {
            const formattedTags = await searchTagsInCoreAPI(value);
            if (mode === "in") {
              setAvailableTagsIn(formattedTags);
            } else {
              setAvailableTagsNot(formattedTags);
            }
          },
          500
        );
      } else {
        setAvailableTagsIn([]);
        setAvailableTagsNot([]);
      }
    };

  return {
    searchInputValueIn,
    searchInputValueNot,
    availableTagsIn,
    availableTagsNot,
    handleSearchInputChange,
  };
}

/**
 * The React component that renders the tags filter section.
 */

interface DataSourceTagsFilterDropdown {
  owner: WorkspaceType;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
  currentDataSourceConfiguration: DataSourceViewSelectionConfiguration;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
}

export function DataSourceTagsFilterDropdown({
  owner,
  dataSourceConfigurations,
  currentDataSourceConfiguration,
  onSave,
}: DataSourceTagsFilterDropdown) {
  const dataSource = currentDataSourceConfiguration.dataSourceView.dataSource;
  const selectedTagsIn = getActionTags(currentDataSourceConfiguration, "in");
  const selectedTagsNot = getActionTags(currentDataSourceConfiguration, "not");
  const dustAPIDataSourceIds = [
    currentDataSourceConfiguration.dataSourceView.dataSource
      .dustAPIDataSourceId,
  ];

  const { isLoading, searchTagsInCoreAPI } = useGetAvailableTags({
    owner,
    dustAPIDataSourceIds,
    selectedTagsIn,
    selectedTagsNot,
  });

  const {
    searchInputValueIn,
    searchInputValueNot,
    availableTagsIn,
    availableTagsNot,
    handleSearchInputChange,
  } = useTagSearch();

  const handleTagOperation = (
    tag: DataSourceTag,
    mode: "in" | "not",
    operation: "add" | "remove"
  ) => {
    // We need a Deep copy otherwise we will mutate the original object
    // And we will not be able to cancel the changes if we cancel the modal.
    const newDsc = { ...currentDataSourceConfiguration };
    if (!newDsc.tagsFilter || newDsc.tagsFilter === "auto") {
      newDsc.tagsFilter = { in: [], not: [] };
    } else {
      newDsc.tagsFilter = { ...newDsc.tagsFilter };
    }

    if (operation === "add") {
      newDsc.tagsFilter[mode] = [...newDsc.tagsFilter[mode], tag.tag];
    } else {
      newDsc.tagsFilter[mode] = newDsc.tagsFilter[mode].filter(
        (t: string) => t !== tag.tag
      );
    }

    onSave({
      ...dataSourceConfigurations,
      [newDsc.dataSourceView.sId]: newDsc,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" icon={FilterIcon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        style={{
          width: "500px",
          marginTop: "10px",
        }}
      >
        <DropdownMenuLabel
          label={`Filter documents using labels from ${getDisplayNameForDataSource(
            dataSource
          )}`}
        />
        <div className="flex flex-col gap-4 p-2">
          <div className="flex flex-col gap-2">
            <div className="font-semibold text-element-800">
              Required labels
            </div>
            <TagSearchInput
              placeholder="Search labels..."
              searchInputValue={searchInputValueIn}
              setSearchInputValue={(value) =>
                handleSearchInputChange(searchTagsInCoreAPI)(value, "in")
              }
              availableTags={availableTagsIn}
              selectedTags={selectedTagsIn}
              onTagAdd={(tag) => handleTagOperation(tag, "in", "add")}
              onTagRemove={(tag) => handleTagOperation(tag, "in", "remove")}
              isLoading={isLoading}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="font-semibold text-element-800">Exclude labels</div>
            <TagSearchInput
              placeholder="Search labels..."
              searchInputValue={searchInputValueNot}
              setSearchInputValue={(value) =>
                handleSearchInputChange(searchTagsInCoreAPI)(value, "not")
              }
              availableTags={availableTagsNot}
              selectedTags={selectedTagsNot}
              onTagAdd={(tag) => handleTagOperation(tag, "not", "add")}
              onTagRemove={(tag) => handleTagOperation(tag, "not", "remove")}
              isLoading={isLoading}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
