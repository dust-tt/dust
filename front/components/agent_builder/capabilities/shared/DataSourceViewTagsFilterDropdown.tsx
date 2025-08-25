import {
  Button,
  Label,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { TagSearchSection } from "@app/components/assistant_builder/tags/TagSearchSection";
import type { DataSourceTag } from "@app/types";

import { transformTreeToSelectionConfigurations } from "../knowledge/transformations";

export function DataSourceViewTagsFilterDropdown() {
  const [tagsIn, setTagsIn] = useState<DataSourceTag[]>([]);
  const [tagsNotIn, setTagsNotIn] = useState<DataSourceTag[]>([]);
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { owner } = useAgentBuilderContext();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });
  const dataSourceConfigurations = transformTreeToSelectionConfigurations(
    sources,
    supportedDataSourceViews
  );

  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button label="Filters" isSelect />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="max-h-[var(--radix-popper-available-height)] w-[600px] max-w-[600px] overflow-scroll"
        collisionPadding={20}
      >
        <div className="flex flex-col gap-8 p-2">
          <div className="flex flex-col gap-2">
            <Page.SectionHeader
              title="Filtering"
              description="Filter to only include content bearing must-have labels, and exclude content with must-not-have labels."
            />
          </div>

          <TagSearchSection
            label="Must-have labels"
            dataSourceViews={Object.values(dataSourceConfigurations).map(
              (ds) => ds.dataSourceView
            )}
            owner={owner}
            selectedTagsIn={tagsIn}
            selectedTagsNot={tagsNotIn}
            onTagAdd={(tag) => setTagsIn((prev) => [...prev, tag])}
            onTagRemove={(tag) =>
              setTagsIn((prev) => prev.filter((t) => t.tag !== tag.tag))
            }
            operation="in"
          />

          <TagSearchSection
            label="Must-not-have labels"
            dataSourceViews={Object.values(dataSourceConfigurations).map(
              (ds) => ds.dataSourceView
            )}
            owner={owner}
            selectedTagsIn={tagsIn}
            selectedTagsNot={tagsNotIn}
            onTagAdd={(tag) => setTagsNotIn((prev) => [...prev, tag])}
            onTagRemove={(tag) =>
              setTagsNotIn((prev) => prev.filter((t) => t.tag !== tag.tag))
            }
            operation="not"
          />

          <div className="flex flex-col gap-2">
            <Page.SectionHeader
              title="In-conversation filtering"
              description="Allow agents to determine filters to apply based on conversation context."
            />
          </div>
          <div className="flex flex-row items-center gap-2">
            {/* <SliderToggle */}
            {/*   selected={tagsFilter?.mode === "auto"} */}
            {/*   onClick={() => { */}
            {/*     handleAutoFilter(tagsFilter?.mode !== "auto"); */}
            {/*   }} */}
            {/*   size="xs" */}
            {/* /> */}
            <Label>Enable in-conversation filtering</Label>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
