import type {
  DataSourceTag,
  DataSourceViewSelectionConfiguration,
} from "@dust-tt/types";

import type {
  AssistantBuilderProcessConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderRetrievalExhaustiveConfiguration,
} from "@app/components/assistant_builder/types";

/**
 * Get the list of dustAPI data source ids used in the action.
 */
export function getActionDustAPIDataSourceIds(
  actionConfig:
    | AssistantBuilderRetrievalConfiguration
    | AssistantBuilderRetrievalExhaustiveConfiguration
    | AssistantBuilderProcessConfiguration
): string[] {
  return Object.values(actionConfig.dataSourceConfigurations).map(
    (ds: DataSourceViewSelectionConfiguration) =>
      ds.dataSourceView.dataSource.dustAPIDataSourceId
  );
}

/**
 * Get the list of tags selected in the action.
 */
export function getActionTags(
  actionConfig:
    | AssistantBuilderRetrievalConfiguration
    | AssistantBuilderRetrievalExhaustiveConfiguration
    | AssistantBuilderProcessConfiguration,
  mode: "in" | "not"
): DataSourceTag[] {
  return Object.values(actionConfig.dataSourceConfigurations)
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
