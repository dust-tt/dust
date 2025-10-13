import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

/**
 * Generates a title for an extract results JSON file based on the schema
 *
 * @param schema - The JSON schema used for extraction
 * @returns A formatted file title string with .json extension
 */
export function getExtractFileTitle({
  schema,
}: {
  schema: JSONSchema | null;
}): string {
  const schemaNames = Object.keys(schema?.properties ?? {}).join("_");
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const title = schema?.title || schemaNames || "extract_results";
  // Make sure title is truncated to 100 characters
  return `${title.substring(0, 100)}.json`;
}

/**
 * Apply data source filters to the Dust app configuration.
 * This function modifies the config object in place to add filtering for parents and tags.
 */
export function applyDataSourceFilters(
  config: any,
  dataSources: DataSourceConfiguration[],
  dataSourceViewsMap: Record<string, DataSourceViewResource>,
  globalTagsIn: string[] | null,
  globalTagsNot: string[] | null
) {
  for (const ds of dataSources) {
    // Note: empty array in parents/tags.in means "no document match" since no documents has any
    // tags/parents that is in the empty array.
    if (!config.DATASOURCE.filter.parents) {
      config.DATASOURCE.filter.parents = {};
    }
    if (ds.filter.parents?.in) {
      if (!config.DATASOURCE.filter.parents.in_map) {
        config.DATASOURCE.filter.parents.in_map = {};
      }

      const dsView = dataSourceViewsMap[ds.dataSourceViewId];
      // This should never happen since dataSourceViews are stored by id in the
      // agent_data_source_configurations table.
      assert(dsView, `Data source view ${ds.dataSourceViewId} not found`);

      // Note we use the dustAPIDataSourceId here since this is what is returned from the registry
      // lookup.
      config.DATASOURCE.filter.parents.in_map[
        dsView.dataSource.dustAPIDataSourceId
      ] = ds.filter.parents.in;
    }
    if (ds.filter.parents?.not) {
      if (!config.DATASOURCE.filter.parents.not) {
        config.DATASOURCE.filter.parents.not = [];
      }
      config.DATASOURCE.filter.parents.not.push(...ds.filter.parents.not);
    }

    // Handle tags filtering.
    if (ds.filter.tags) {
      if (!config.DATASOURCE.filter.tags?.in_map) {
        config.DATASOURCE.filter.tags = {
          in_map: {},
          not_map: {},
        };
      }

      const dsView = dataSourceViewsMap[ds.dataSourceViewId];
      assert(dsView, `Data source view ${ds.dataSourceViewId} not found`);

      const tagsIn =
        ds.filter.tags.mode === "auto"
          ? [...(globalTagsIn ?? []), ...(ds.filter.tags.in ?? [])]
          : ds.filter.tags.in;
      const tagsNot =
        ds.filter.tags.mode === "auto"
          ? [...(globalTagsNot ?? []), ...(ds.filter.tags.not ?? [])]
          : ds.filter.tags.not;

      if (tagsIn && tagsNot && (tagsIn.length > 0 || tagsNot.length > 0)) {
        config.DATASOURCE.filter.tags.in_map[
          dsView.dataSource.dustAPIDataSourceId
        ] = tagsIn;
        config.DATASOURCE.filter.tags.not_map[
          dsView.dataSource.dustAPIDataSourceId
        ] = tagsNot;
      }
    }
  }
}
