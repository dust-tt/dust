import type {
  DataSourceTag,
  DataSourceViewSelectionConfiguration,
} from "@dust-tt/types";

/**
 * Get the list of tags selected in the action.
 */
export function getActionTags(
  dsConfig: DataSourceViewSelectionConfiguration,
  mode: "in" | "not"
): DataSourceTag[] {
  if (!dsConfig.tagsFilter) {
    return [];
  }
  const dscFilter =
    mode === "in" ? dsConfig.tagsFilter?.in : dsConfig.tagsFilter?.not;
  return dscFilter.map((t: string) => ({
    tag: t,
    dustAPIDataSourceId: dsConfig.dataSourceView.dataSource.dustAPIDataSourceId,
    connectorProvider: dsConfig.dataSourceView.dataSource.connectorProvider,
  }));
}
