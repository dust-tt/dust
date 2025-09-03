import { Button, ContextItem } from "@dust-tt/sparkle";
import { useWatch } from "react-hook-form";

import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { CONFIGURATION_SHEET_PAGE_IDS } from "@app/components/agent_builder/types";
import { useKnowledgePageContext } from "@app/components/data_source_view/context/PageContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceViewType } from "@app/types";
import { pluralize } from "@app/types";

type DataSourceFilterItem = {
  dataSourceView: DataSourceViewType;
};

type DataSourceFilterContextItemProps = {
  item: DataSourceFilterItem;
};

function DataSourceFilterContextItem({
  item: { dataSourceView },
}: DataSourceFilterContextItemProps) {
  const { isDark } = useTheme();
  const { spaces } = useSpacesContext();

  const spaceName = spaces.find((s) => s.sId === dataSourceView.spaceId)?.name;

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
      subElement={spaceName && <span className="text-xs">{spaceName}</span>}
    />
  );
}

export function SelectDataSourcesFilters() {
  const { setSheetPageId } = useKnowledgePageContext();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const dataSourceViews = sources.in.reduce(
    (acc, source) => {
      if (source.type === "data_source") {
        acc[source.dataSourceView.dataSource.dustAPIDataSourceId] = {
          dataSourceView: source.dataSourceView,
        };
      } else if (source.type === "node") {
        acc[source.node.dataSourceView.dataSource.dustAPIDataSourceId] = {
          dataSourceView: source.node.dataSourceView,
        };
      }

      return acc;
    },
    {} as Record<string, DataSourceFilterItem>
  );

  return (
    <div className="space-y-4">
      <div className="align-center flex flex-row justify-between">
        <h3 className="mb-2 text-lg font-semibold">
          Selected data source{pluralize(Object.values(dataSourceViews).length)}
        </h3>

        <div className="flex flex-row items-center space-x-2">
          <Button
            label="Manage selection"
            onClick={() =>
              setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION)
            }
          />
          <DataSourceViewTagsFilterDropdown />
        </div>
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
