import {
  Button,
  ContextItem,
  MoreIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useWatch } from "react-hook-form";

import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceViewType, TagsFilter } from "@app/types";

type DataSourceFilterItem = {
  mode: NonNullable<TagsFilter>["mode"];
  dataSourceView: DataSourceViewType;
};

type DataSourceFilterContextItemProps = {
  item: DataSourceFilterItem;
};

function DataSourceFilterContextItem({
  item: { dataSourceView, mode },
}: DataSourceFilterContextItemProps) {
  const { isDark } = useTheme();
  const { toggleTagsMode } = useDataSourceBuilderContext();

  return (
    <ContextItem
      key={dataSourceView.id}
      title={getDisplayNameForDataSource(dataSourceView.dataSource)}
      visual={
        <ContextItem.Visual
          visual={getConnectorProviderLogoWithFallback({
            provider: dataSourceView.dataSource.connectorProvider,
            isDark,
          })}
        />
      }
      action={
        <PopoverRoot>
          <PopoverTrigger asChild>
            <Button icon={MoreIcon} variant="ghost" size="mini" />
          </PopoverTrigger>

          <PopoverContent align="end" className="w-72 text-sm">
            <div className="mb-1 font-semibold">In-conversation filtering</div>
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              Allow agents to determine filters to apply based on conversation
              context.
            </div>
            <div className="mt-2 flex flex-row items-center justify-between">
              <SliderToggle
                selected={mode === "auto"}
                onClick={() => toggleTagsMode(dataSourceView)}
              />
              <div className="font-medium">Enable in converation filtering</div>
            </div>
          </PopoverContent>
        </PopoverRoot>
      }
    />
  );
}

export function SelectDataSourcesFilters() {
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });
  const dataSourceViews = sources.in.reduce(
    (acc, source) => {
      if (source.type === "data_source") {
        acc[source.dataSourceView.dataSource.dustAPIDataSourceId] = {
          dataSourceView: source.dataSourceView,
          mode: source.tagsFilter?.mode ?? "custom",
        };
      } else if (source.type === "node") {
        acc[source.node.dataSourceView.dataSource.dustAPIDataSourceId] = {
          dataSourceView: source.node.dataSourceView,
          mode: source.tagsFilter?.mode ?? "custom",
        };
      }

      return acc;
    },
    {} as Record<string, DataSourceFilterItem>
  );

  return (
    <div className="space-y-4">
      <div className="align-center flex flex-row justify-between">
        <h3 className="mb-2 text-lg font-semibold">Selected data source</h3>

        <DataSourceViewTagsFilterDropdown />
      </div>

      <div>
        <div className="rounded-xl bg-muted dark:bg-muted-night">
          <ContextItem.List className="max-h-40 overflow-x-scroll">
            {Object.values(dataSourceViews).map((item) => (
              <DataSourceFilterContextItem
                key={item.dataSourceView.id}
                item={item}
              />
            ))}
          </ContextItem.List>
        </div>
      </div>
    </div>
  );
}
