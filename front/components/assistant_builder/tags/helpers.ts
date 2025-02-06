import type {
  DataSourceTag,
  DataSourceViewSelectionConfiguration,
} from "@dust-tt/types";

import type {
  AssistantBuilderActionConfigurationWithId,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderRetrievalExhaustiveConfiguration,
} from "@app/components/assistant_builder/types";

/**
 * Check if the action has a filter configuration.
 */
export function isActionWithFilters(
  action: AssistantBuilderActionConfigurationWithId
): action is AssistantBuilderActionConfigurationWithId & {
  configuration:
    | AssistantBuilderRetrievalConfiguration
    | AssistantBuilderRetrievalExhaustiveConfiguration
    | AssistantBuilderProcessConfiguration;
} {
  return (
    action.type === "RETRIEVAL_SEARCH" ||
    action.type === "RETRIEVAL_EXHAUSTIVE" ||
    action.type === "PROCESS"
  );
}

/**
 * Get the list of dustAPI data source ids used in the action.
 */
export function getActionDustAPIDataSourceIds(
  action: AssistantBuilderActionConfigurationWithId
): string[] {
  if (!isActionWithFilters(action)) {
    return [];
  }
  return Object.values(action.configuration.dataSourceConfigurations).map(
    (ds: DataSourceViewSelectionConfiguration) =>
      ds.dataSourceView.dataSource.dustAPIDataSourceId
  );
}

/**
 * Get the list of tags selected in the action.
 */
export function getActionTags(
  action: AssistantBuilderActionConfigurationWithId,
  mode: "in" | "not"
): DataSourceTag[] {
  if (!isActionWithFilters(action)) {
    return [];
  }
  return Object.values(action.configuration.dataSourceConfigurations)
    .flatMap((dsc) => {
      if (!dsc.tagsFilter || dsc.tagsFilter === "auto") {
        return [];
      }
      const dscFilter =
        mode === "in" ? dsc.tagsFilter?.in : dsc.tagsFilter?.not;
      return dscFilter.map((t: string) => ({
        tag: t,
        dustAPIDataSourceId: dsc.dataSourceView.dataSource.dustAPIDataSourceId,
        connectorProvider: dsc.dataSourceView.dataSource.connectorProvider,
      }));
    })
    .filter((t) => t !== null);
}
