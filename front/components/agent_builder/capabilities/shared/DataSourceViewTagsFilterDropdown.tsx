import {
  Button,
  Page,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { TagSearchSection } from "@app/components/assistant_builder/tags/TagSearchSection";
import type { DataSourceTag, DataSourceViewType } from "@app/types";

export function DataSourceViewTagsFilterDropdown() {
  const { owner } = useAgentBuilderContext();
  const { setValue } = useFormContext<CapabilityFormData>();
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
        const dsv = dataSourceViews.find(
          (dsv) =>
            dsv.dataSource.dustAPIDataSourceId === tag.dustAPIDataSourceId
        );
        if (!dsv) {
          console.error("No dataSourceView found for the tag");
          return;
        }

        const sourceIdx = sources.in.findIndex((source) => {
          if (
            source.type === "data_source" &&
            source.dataSourceView.dataSource.dustAPIDataSourceId ===
              tag.dustAPIDataSourceId
          ) {
            return true;
          } else if (
            source.type === "node" &&
            source.node.dataSourceView.dataSource.dustAPIDataSourceId ===
              tag.dustAPIDataSourceId
          ) {
            return true;
          }
          return false;
        });

        if (sourceIdx < 0) {
          console.error("No source found");
          return;
        }

        const source = sources.in[sourceIdx];
        if (source.type !== "data_source" && source.type !== "node") {
          console.error("Source type does not support tags filter");
          return;
        }

        const currentSource = sources.in[sourceIdx];

        if (
          currentSource.type !== "data_source" &&
          currentSource.type !== "node"
        ) {
          console.error("Current source type does not support tags filter");
          return;
        }

        const currentTagsFilter = currentSource.tagsFilter;

        let newTagsFilter = currentTagsFilter || {
          in: [],
          not: [],
          mode: "custom" as const,
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

        // If all tags are removed and mode is not auto, set tagsFilter to null
        if (
          newTagsFilter.in.length === 0 &&
          newTagsFilter.not.length === 0 &&
          newTagsFilter.mode !== "auto"
        ) {
          setValue(`sources.in.${sourceIdx}.tagsFilter`, null);
        } else {
          setValue(`sources.in.${sourceIdx}.tagsFilter`, newTagsFilter);
        }
      };
    },
    [dataSourceViews, sources.in, setValue]
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
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
