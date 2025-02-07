import type { DataSourceTag, WorkspaceType } from "@dust-tt/types";
import { useMemo, useRef, useState } from "react";

import {
  getActionDustAPIDataSourceIds,
  getActionTags,
} from "@app/components/assistant_builder/tags/helpers";
import { TagSearchInput } from "@app/components/assistant_builder/tags/TagSearchInput";
import type { AssistantBuilderRetrievalConfiguration } from "@app/components/assistant_builder/types";
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
 * Handle the addition and removal of tags from the action configuration.
 */
function useUpdateTagOperations({
  updateAction,
  setEdited,
}: {
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  const handleTagOperation = (
    tag: DataSourceTag,
    mode: "in" | "not",
    operation: "add" | "remove"
  ) => {
    setEdited(true);
    updateAction((previousAction) => {
      const dsc = Object.values(previousAction.dataSourceConfigurations).find(
        (dataSourceConfiguration) =>
          dataSourceConfiguration.dataSourceView.dataSource
            .dustAPIDataSourceId === tag.dustAPIDataSourceId
      );

      if (!dsc) {
        return { ...previousAction };
      }

      if (!dsc.tagsFilter || dsc.tagsFilter === "auto") {
        dsc.tagsFilter = { in: [], not: [] };
      }

      if (operation === "add") {
        dsc.tagsFilter[mode].push(tag.tag);
      } else {
        dsc.tagsFilter[mode] = dsc.tagsFilter[mode].filter(
          (t: string) => t !== tag.tag
        );
      }

      const dataSourceConfigurations = {
        ...previousAction.dataSourceConfigurations,
        [dsc.dataSourceView.sId]: dsc,
      };

      return {
        ...previousAction,
        dataSourceConfigurations,
      };
    });
  };

  const handleTagAdd = (tag: DataSourceTag, mode: "in" | "not") => {
    handleTagOperation(tag, mode, "add");
  };

  const handleTagRemove = (tag: DataSourceTag, mode: "in" | "not") => {
    handleTagOperation(tag, mode, "remove");
  };

  return { handleTagAdd, handleTagRemove };
}

/**
 * The React component that renders the tags filter section.
 */
export function ActionDataSourceTagsFilterSection({
  owner,
  actionConfig,
  updateAction,
  setEdited,
}: {
  owner: WorkspaceType;
  actionConfig: AssistantBuilderRetrievalConfiguration;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  const dustAPIDataSourceIds = useMemo(
    () => getActionDustAPIDataSourceIds(actionConfig),
    [actionConfig]
  );
  const selectedTagsIn = useMemo(
    () => getActionTags(actionConfig, "in"),
    [actionConfig]
  );
  const selectedTagsNot = useMemo(
    () => getActionTags(actionConfig, "not"),
    [actionConfig]
  );

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

  const { handleTagAdd, handleTagRemove } = useUpdateTagOperations({
    updateAction,
    setEdited,
  });

  return (
    <div className="mb-12 flex flex-col gap-4 pt-8">
      <div className="flex flex-col gap-2">
        <div className="font-semibold text-element-800">Filtering</div>
        <div className="text-sm text-element-600">
          Filter documents based on labels from your folder or connected data
          sources (Notion properties, Google Drive labels, etc.).
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-element-800">Include</div>
          <TagSearchInput
            placeholder="Search labels..."
            searchInputValue={searchInputValueIn}
            setSearchInputValue={(value) =>
              handleSearchInputChange(searchTagsInCoreAPI)(value, "in")
            }
            availableTags={availableTagsIn}
            selectedTags={selectedTagsIn}
            onTagAdd={(tag) => handleTagAdd(tag, "in")}
            onTagRemove={(tag) => handleTagRemove(tag, "in")}
            isLoading={isLoading}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-element-800">Exclude</div>
          <TagSearchInput
            placeholder="Search labels..."
            searchInputValue={searchInputValueNot}
            setSearchInputValue={(value) =>
              handleSearchInputChange(searchTagsInCoreAPI)(value, "not")
            }
            availableTags={availableTagsNot}
            selectedTags={selectedTagsNot}
            onTagAdd={(tag) => handleTagAdd(tag, "not")}
            onTagRemove={(tag) => handleTagRemove(tag, "not")}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
