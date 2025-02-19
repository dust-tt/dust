import {
  Button,
  Label,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  DataSourceTag,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  WorkspaceType,
} from "@dust-tt/types";
import { cloneDeep } from "lodash";
import { useRef, useState } from "react";

import { getActionTags } from "@app/components/assistant_builder/tags/helpers";
import { TagSearchInput } from "@app/components/assistant_builder/tags/TagSearchInput";
import { useTagSearchEndpoint } from "@app/lib/swr/data_sources";
import { debounce } from "@app/lib/utils/debounce";

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
  const dustAPIDataSourceIds = [dataSource.dustAPIDataSourceId];

  const {
    searchInputValueIn,
    searchInputValueNot,
    availableTagsIn,
    availableTagsNot,
    handleSearchInputChange,
    isLoadingIn,
    isLoadingNot,
  } = useTagSearch({
    owner,
    dustAPIDataSourceIds,
    selectedTagsIn,
    selectedTagsNot,
  });

  const handleTagOperation = (
    tag: DataSourceTag,
    include: "in" | "not",
    operation: "add" | "remove"
  ) => {
    const newDsc = cloneDeep(currentDataSourceConfiguration);

    if (!newDsc.tagsFilter) {
      newDsc.tagsFilter = { in: [], not: [], mode: "custom" };
    }

    if (operation === "add") {
      newDsc.tagsFilter[include] = [...newDsc.tagsFilter[include], tag.tag];
    } else {
      newDsc.tagsFilter[include] = newDsc.tagsFilter[include].filter(
        (t: string) => t !== tag.tag
      );
    }

    // If we removed all tags and we are not in auto mode, we should set back to null
    if (
      newDsc.tagsFilter.in.length === 0 &&
      newDsc.tagsFilter.not.length === 0 &&
      newDsc.tagsFilter.mode !== "auto"
    ) {
      newDsc.tagsFilter = null;
    }

    onSave({
      ...dataSourceConfigurations,
      [newDsc.dataSourceView.sId]: newDsc,
    });
  };

  const handleAutoFilter = (isChecked: boolean) => {
    const newDsc = cloneDeep(currentDataSourceConfiguration);

    if (isChecked) {
      if (!newDsc.tagsFilter) {
        newDsc.tagsFilter = { in: [], not: [], mode: "auto" };
      } else {
        newDsc.tagsFilter.mode = "auto";
      }
    } else {
      if (
        newDsc.tagsFilter &&
        (newDsc.tagsFilter.in.length > 0 || newDsc.tagsFilter.not.length > 0)
      ) {
        newDsc.tagsFilter.mode = "custom";
      } else {
        newDsc.tagsFilter = null;
      }
    }

    onSave({
      ...dataSourceConfigurations,
      [newDsc.dataSourceView.sId]: newDsc,
    });
  };

  const tagsFilter = currentDataSourceConfiguration.tagsFilter;
  let tagsCounter: number | null = null;

  if (tagsFilter) {
    const isAuto = tagsFilter.mode === "auto";
    tagsCounter =
      tagsFilter.in.length + tagsFilter.not.length + (isAuto ? 1 : 0);
  }

  return (
    <PopoverRoot
      onOpenChange={(open) => {
        if (!open) {
          handleSearchInputChange("", "in");
          handleSearchInputChange("", "not");
        }
      }}
      modal={true}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          label="Filters"
          isSelect
          counterValue={tagsCounter ? tagsCounter.toString() : "auto"}
          isCounter={tagsCounter !== null}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[600px] max-w-[600px]">
        <div className="flex flex-col gap-8 p-2">
          <div className="flex flex-col gap-2">
            <Page.SectionHeader
              title="Filtering"
              description="Filter to only include content bearing must-have labels, and exclude content with must-not-have labels."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Must-have labels</Label>
            <TagSearchInput
              searchInputValue={searchInputValueIn}
              setSearchInputValue={(value) =>
                handleSearchInputChange(value, "in")
              }
              availableTags={availableTagsIn}
              selectedTags={selectedTagsIn}
              onTagAdd={(tag) => handleTagOperation(tag, "in", "add")}
              onTagRemove={(tag) => handleTagOperation(tag, "in", "remove")}
              isLoading={isLoadingIn}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Must-not-have labels</Label>
            <TagSearchInput
              searchInputValue={searchInputValueNot}
              setSearchInputValue={(value) =>
                handleSearchInputChange(value, "not")
              }
              availableTags={availableTagsNot}
              selectedTags={selectedTagsNot}
              onTagAdd={(tag) => handleTagOperation(tag, "not", "add")}
              onTagRemove={(tag) => handleTagOperation(tag, "not", "remove")}
              tagChipColor="red"
              isLoading={isLoadingNot}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Page.SectionHeader
              title="Conversation filtering"
              description="Allow agents to determine filters to apply based on conversation context. This will override filtering settings above."
            />
          </div>
          <div className="flex flex-row items-center gap-2">
            <SliderToggle
              selected={tagsFilter?.mode === "auto"}
              onClick={() => {
                handleAutoFilter(tagsFilter?.mode !== "auto");
              }}
              size="xs"
            />
            <Label>Enable conversation filtering</Label>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

/**
 * Handle the search input state logic.
 */
function useTagSearch({
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
  const [searchInputValueIn, setSearchInputValueIn] = useState<string>("");
  const [searchInputValueNot, setSearchInputValueNot] = useState<string>("");
  const [availableTagsIn, setAvailableTagsIn] = useState<DataSourceTag[]>([]);
  const [availableTagsNot, setAvailableTagsNot] = useState<DataSourceTag[]>([]);
  const searchHandleIn = useRef<NodeJS.Timeout>();
  const searchHandleNot = useRef<NodeJS.Timeout>();
  const [isLoadingIn, setIsLoadingIn] = useState(false);
  const [isLoadingNot, setIsLoadingNot] = useState(false);
  const { searchTags } = useTagSearchEndpoint({ owner });

  const searchTagsInCoreAPI = async (query: string) => {
    try {
      const tags = await searchTags({
        query,
        queryType: "match",
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
    }
  };

  const handleSearchInputChange = (value: string, mode: "in" | "not") => {
    const setSearchValue =
      mode === "in" ? setSearchInputValueIn : setSearchInputValueNot;
    const setAvailableTags =
      mode === "in" ? setAvailableTagsIn : setAvailableTagsNot;
    const setIsLoading = mode === "in" ? setIsLoadingIn : setIsLoadingNot;
    const searchHandle = mode === "in" ? searchHandleIn : searchHandleNot;

    setSearchValue(value);

    if (!value.trim()) {
      setAvailableTags([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounce(
      searchHandle,
      async () => {
        try {
          const formattedTags = await searchTagsInCoreAPI(value);
          setAvailableTags(formattedTags);
        } catch (error) {
          console.error("Failed to search tags:", error);
          setAvailableTags([]);
        } finally {
          setIsLoading(false);
        }
      },
      500
    );
  };

  return {
    searchInputValueIn,
    searchInputValueNot,
    availableTagsIn,
    availableTagsNot,
    handleSearchInputChange,
    isLoadingIn,
    isLoadingNot,
  };
}
