import {
  Button,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import { useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { TagSearchSection } from "@app/components/assistant_builder/tags/TagSearchSection";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { DataSourceTag, DataSourceViewType, TagsFilter } from "@app/types";

export function DataSourceViewTagsFilterDropdown() {
  const { owner } = useAgentBuilderContext();
  const { updateSourcesTags } = useDataSourceBuilderContext();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const dataSourceViews = sources.in.reduce((acc, source) => {
    if (source.type === "data_source") {
      acc.push(source.dataSourceView);
    } else if (source.type === "node") {
      acc.push(source.node.dataSourceView);
    }
    return acc;
  }, [] as DataSourceViewType[]);

  const handleTagsOperation = useCallback(
    (include: "in" | "not", operation: "add" | "remove") => {
      return (tag: DataSourceTag) => {
        const sourceIndexes = sources.in.reduce((acc, source, index) => {
          if (
            source.type === "data_source" &&
            source.dataSourceView.dataSource.dustAPIDataSourceId ===
              tag.dustAPIDataSourceId
          ) {
            acc.push(index);
          } else if (
            source.type === "node" &&
            source.node.dataSourceView.dataSource.dustAPIDataSourceId ===
              tag.dustAPIDataSourceId
          ) {
            acc.push(index);
          }

          return acc;
        }, [] as number[]);

        if (sourceIndexes.length < 0) {
          console.error("No source found");
          return;
        }

        for (const sourceIdx of sourceIndexes) {
          const source = sources.in[sourceIdx];
          if (source.type !== "data_source" && source.type !== "node") {
            console.error("Source type does not support tags filter");
            continue;
          }

          let newTagsFilter: TagsFilter = source.tagsFilter || {
            in: [],
            not: [],
            mode: "custom",
          };

          if (operation === "add") {
            // Add tag to the specified array if not already present
            if (!newTagsFilter[include].includes(tag.tag)) {
              newTagsFilter = {
                ...newTagsFilter,
                [include]: [...newTagsFilter[include], tag.tag],
              };
            }
          } else if (operation === "remove") {
            // Remove tag from the specified array
            newTagsFilter = {
              ...newTagsFilter,
              [include]: newTagsFilter[include].filter(
                (t: string) => t !== tag.tag
              ),
            };
          }

          console.log({ newTagsFilter });

          // If all tags are removed and mode is not auto, set tagsFilter to null
          if (
            newTagsFilter.in.length === 0 &&
            newTagsFilter.not.length === 0 &&
            newTagsFilter.mode !== "auto"
          ) {
            updateSourcesTags(sourceIdx, null);
          } else {
            updateSourcesTags(sourceIdx, newTagsFilter);
          }
        }
      };
    },
    [sources.in, updateSourcesTags]
  );

  const { tagsIn, tagsNotIn } = useMemo(() => {
    return sources.in.reduce(
      ({ tagsIn, tagsNotIn }, source) => {
        if (source.type === "data_source") {
          if (source.tagsFilter !== null) {
            tagsIn.push(
              ...source.tagsFilter.in.map((tag) => ({
                tag,
                dustAPIDataSourceId:
                  source.dataSourceView.dataSource.dustAPIDataSourceId,
                connectorProvider:
                  source.dataSourceView.dataSource.connectorProvider,
              }))
            );

            tagsNotIn.push(
              ...source.tagsFilter.not.map((tag) => ({
                tag,
                dustAPIDataSourceId:
                  source.dataSourceView.dataSource.dustAPIDataSourceId,
                connectorProvider:
                  source.dataSourceView.dataSource.connectorProvider,
              }))
            );
          }
        } else if (source.type === "node") {
          if (source.tagsFilter !== null) {
            tagsIn.push(
              ...source.tagsFilter.in.map((tag) => ({
                tag,
                dustAPIDataSourceId:
                  source.node.dataSourceView.dataSource.dustAPIDataSourceId,
                connectorProvider:
                  source.node.dataSourceView.dataSource.connectorProvider,
              }))
            );

            tagsNotIn.push(
              ...source.tagsFilter.not.map((tag) => ({
                tag,
                dustAPIDataSourceId:
                  source.node.dataSourceView.dataSource.dustAPIDataSourceId,
                connectorProvider:
                  source.node.dataSourceView.dataSource.connectorProvider,
              }))
            );
          }
        }

        return {
          tagsIn,
          tagsNotIn,
        };
      },
      { tagsIn: [], tagsNotIn: [] } as {
        tagsIn: DataSourceTag[];
        tagsNotIn: DataSourceTag[];
      }
    );
  }, [sources.in]);

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
            dataSourceViews={dataSourceViews}
            owner={owner}
            selectedTagsIn={tagsIn}
            selectedTagsNot={tagsNotIn}
            onTagAdd={handleTagsOperation("in", "add")}
            onTagRemove={handleTagsOperation("in", "remove")}
            operation="in"
            showChipIcons
          />

          <TagSearchSection
            label="Must-not-have labels"
            dataSourceViews={dataSourceViews}
            owner={owner}
            selectedTagsIn={tagsIn}
            selectedTagsNot={tagsNotIn}
            onTagAdd={handleTagsOperation("not", "add")}
            onTagRemove={handleTagsOperation("not", "remove")}
            operation="not"
            showChipIcons
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
