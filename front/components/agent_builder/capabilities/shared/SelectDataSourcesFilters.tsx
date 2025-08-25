import { ContextItem } from "@dust-tt/sparkle";
import { useWatch } from "react-hook-form";

import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import type { DataSourceViewType } from "@app/types";

export function SelectDataSourcesFilters() {
  const { isDark } = useTheme();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });
  const dataSourceViews = sources.in.reduce(
    (acc, source) => {
      if (source.type === "data_source") {
        acc[source.dataSourceView.dataSource.dustAPIDataSourceId] =
          source.dataSourceView;
      } else if (source.type === "node") {
        acc[source.node.dataSourceView.dataSource.dustAPIDataSourceId] =
          source.node.dataSourceView;
      }

      return acc;
    },
    {} as Record<string, DataSourceViewType>
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
            {Object.values(dataSourceViews).map((dsv) => (
              <ContextItem
                key={dsv.id}
                title={dsv.dataSource.name}
                visual={
                  <ContextItem.Visual
                    visual={getConnectorProviderLogoWithFallback({
                      provider: dsv.dataSource.connectorProvider,
                      isDark,
                    })}
                  />
                }
              />
            ))}
          </ContextItem.List>
        </div>
      </div>
    </div>
  );
}
