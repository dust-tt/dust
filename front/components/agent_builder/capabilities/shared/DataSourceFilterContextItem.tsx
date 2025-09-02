import { ContextItem } from "@dust-tt/sparkle";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceViewType } from "@app/types";

export type DataSourceFilterItem = {
  dataSourceView: DataSourceViewType;
};

export type DataSourceFilterContextItemProps = {
  item: DataSourceFilterItem;
};

export function DataSourceFilterContextItem({
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
