import { ContextItem, SliderToggle, Tooltip } from "@dust-tt/sparkle";
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
        <Tooltip
          align="end"
          trigger={
            <SliderToggle
              selected={mode === "auto"}
              onClick={() => toggleTagsMode(dataSourceView)}
            />
          }
          label={
            <div>
              Enable in-conversation filtering
              <div className="text-muted-foreground dark:text-muted-foreground-night">
                Allow agents to determine filters to apply based on conversation
                context.
              </div>
            </div>
          }
        />
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
