import {
  Button,
  Label,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SliderToggle,
} from "@dust-tt/sparkle";
import { cloneDeep } from "lodash";

import { getActionTags } from "@app/components/assistant_builder/tags/helpers";
import { TagSearchSection } from "@app/components/assistant_builder/tags/TagSearchSection";
import type {
  DataSourceTag,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
} from "@app/types";

interface DataSourceViewTagsFilterDropdownProps {
  currentDataSourceConfiguration: DataSourceViewSelectionConfiguration;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  owner: LightWorkspaceType;
}

export function DataSourceViewTagsFilterDropdown({
  currentDataSourceConfiguration,
  dataSourceConfigurations,
  onSave,
  owner,
}: DataSourceViewTagsFilterDropdownProps) {
  const selectedTagsIn = getActionTags(currentDataSourceConfiguration, "in");
  const selectedTagsNot = getActionTags(currentDataSourceConfiguration, "not");

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
    <PopoverRoot modal={true}>
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

          <TagSearchSection
            label="Must-have labels"
            dataSourceViews={[currentDataSourceConfiguration.dataSourceView]}
            owner={owner}
            selectedTagsIn={selectedTagsIn}
            selectedTagsNot={selectedTagsNot}
            onTagAdd={(tag) => handleTagOperation(tag, "in", "add")}
            onTagRemove={(tag) => handleTagOperation(tag, "in", "remove")}
            operation="in"
          />

          <TagSearchSection
            label="Must-not-have labels"
            dataSourceViews={[currentDataSourceConfiguration.dataSourceView]}
            owner={owner}
            selectedTagsIn={selectedTagsIn}
            selectedTagsNot={selectedTagsNot}
            onTagAdd={(tag) => handleTagOperation(tag, "not", "add")}
            onTagRemove={(tag) => handleTagOperation(tag, "not", "remove")}
            operation="not"
          />

          <div className="flex flex-col gap-2">
            <Page.SectionHeader
              title="In-conversation filtering"
              description="Allow agents to determine filters to apply based on conversation context."
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
            <Label>Enable in-conversation filtering</Label>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
