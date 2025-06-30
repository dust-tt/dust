import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { SearchQueryResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  renderRelativeTimeFrameForToolOutput,
  renderTagsForToolOutput,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  fetchAgentDataSourceConfiguration,
  parseDataSourceConfigurationURI,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { TimeFrame } from "@app/types";
import type { ConnectorProvider, Result } from "@app/types";
import { assertNever, Err, Ok, removeNulls } from "@app/types";

export type ResolvedDataSourceConfiguration = DataSourceConfiguration & {
  dataSource: {
    dustAPIProjectId: string;
    dustAPIDataSourceId: string;
    connectorProvider: ConnectorProvider | null;
    name: string;
  };
};

export function makeQueryResource(
  query: string,
  relativeTimeFrame: TimeFrame | null,
  tagsIn?: string[],
  tagsNot?: string[]
): SearchQueryResourceType {
  const timeFrameAsString =
    renderRelativeTimeFrameForToolOutput(relativeTimeFrame);
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: query
      ? `Searching "${query}", ${timeFrameAsString}${tagsAsString}.`
      : `Searching ${timeFrameAsString}${tagsAsString}.`,
    uri: "",
  };
}

export async function getAgentDataSourceConfigurations(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<ResolvedDataSourceConfiguration[], Error>> {
  const configResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration) => {
      const configInfoRes = parseDataSourceConfigurationURI(
        dataSourceConfiguration.uri
      );

      if (configInfoRes.isErr()) {
        return configInfoRes;
      }

      const configInfo = configInfoRes.value;

      switch (configInfo.type) {
        case "database": {
          // Database configuration
          const r = await fetchAgentDataSourceConfiguration(configInfo.sId);
          if (r.isErr()) {
            return r;
          }
          const agentConfig = r.value;
          const dataSourceViewSId = DataSourceViewResource.modelIdToSId({
            id: agentConfig.dataSourceView.id,
            workspaceId: agentConfig.dataSourceView.workspaceId,
          });
          const resolved: ResolvedDataSourceConfiguration = {
            workspaceId: agentConfig.dataSourceView.workspace.sId,
            dataSourceViewId: dataSourceViewSId,
            filter: {
              parents:
                agentConfig.parentsIn || agentConfig.parentsNotIn
                  ? {
                      in: agentConfig.parentsIn || [],
                      not: agentConfig.parentsNotIn || [],
                    }
                  : null,
              tags:
                agentConfig.tagsIn || agentConfig.tagsNotIn
                  ? {
                      in: agentConfig.tagsIn || [],
                      not: agentConfig.tagsNotIn || [],
                      mode: agentConfig.tagsMode || "custom",
                    }
                  : undefined,
            },
            dataSource: {
              dustAPIProjectId: agentConfig.dataSource.dustAPIProjectId,
              dustAPIDataSourceId: agentConfig.dataSource.dustAPIDataSourceId,
              connectorProvider: agentConfig.dataSource.connectorProvider,
              name: agentConfig.dataSource.name,
            },
          };
          return new Ok(resolved);
        }

        case "dynamic": {
          // Dynamic configuration
          // Verify the workspace ID matches the auth
          if (
            configInfo.configuration.workspaceId !==
            auth.getNonNullableWorkspace().sId
          ) {
            return new Err(
              new Error(
                "Workspace mismatch: configuration workspace " +
                  `${configInfo.configuration.workspaceId} does not match authenticated workspace.`
              )
            );
          }

          // Fetch the specific data source view by ID
          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            configInfo.configuration.dataSourceViewId
          );

          if (!dataSourceView) {
            return new Err(
              new Error(
                `Data source view not found: ${configInfo.configuration.dataSourceViewId}`
              )
            );
          }

          const dataSource = dataSourceView.dataSource;

          const resolved: ResolvedDataSourceConfiguration = {
            ...configInfo.configuration,
            dataSource: {
              dustAPIProjectId: dataSource.dustAPIProjectId,
              dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
              connectorProvider: dataSource.connectorProvider,
              name: dataSource.name,
            },
          };
          return new Ok(resolved);
        }

        default:
          assertNever(configInfo);
      }
    },
    { concurrency: 10 }
  );

  if (configResults.some((res) => res.isErr())) {
    return new Err(new Error("Failed to fetch data source configurations."));
  }

  return new Ok(
    removeNulls(configResults.map((res) => (res.isOk() ? res.value : null)))
  );
}

export function makeDataSourceViewFilter(
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[]
) {
  return agentDataSourceConfigurations.map(({ dataSource, filter }) => ({
    data_source_id: dataSource.dustAPIDataSourceId,
    view_filter: filter.parents?.in ?? [],
  }));
}
