import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  DataSourcesToolConfigurationType,
  TablesConfigurationToolType,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  DATA_SOURCE_CONFIGURATION_URI_PATTERN,
  PROJECT_CONFIGURATION_URI_PATTERN,
  TABLE_CONFIGURATION_URI_PATTERN,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { TagsInputType } from "@app/lib/actions/mcp_internal_actions/types";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  CoreAPIDatasourceViewFilter,
  CoreAPISearchFilter,
} from "@app/types/core/core_api";
import type { ConnectorProvider } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";

const NO_DATA_SOURCE_AVAILABLE_ERROR =
  "No data source is available in the current scope. There is no data to " +
  "search or browse. Retrying is only useful if the data configuration has " +
  "changed on the user's side.";

// Type to represent data source configuration with resolved data source model
export type ResolvedDataSourceConfiguration = DataSourceConfiguration & {
  dataSource: {
    dustAPIProjectId: string;
    dustAPIDataSourceId: string;
    connectorProvider: ConnectorProvider | null;
    name: string;
  };
  dataSourceView: DataSourceViewResource;
};

export function makeCoreSearchNodesFilters({
  agentDataSourceConfigurations,
  includeTagFilters = true,
  additionalDynamicTags,
}: {
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[];
  includeTagFilters?: boolean;
  additionalDynamicTags?: TagsInputType;
}): CoreAPIDatasourceViewFilter[] {
  return agentDataSourceConfigurations.map(
    ({ dataSource, dataSourceView, filter }) => ({
      data_source_id: dataSource.dustAPIDataSourceId,
      view_filter: dataSourceView.parentsIn ?? [],
      filter: filter.parents?.in ?? undefined,
      ...(includeTagFilters
        ? {
            tags: {
              in: [
                ...(filter.tags?.in ?? []),
                ...(additionalDynamicTags?.tagsIn ?? []),
              ],
              not: [
                ...(filter.tags?.not ?? []),
                ...(additionalDynamicTags?.tagsNot ?? []),
              ],
            },
          }
        : {}),
    })
  );
}

async function fetchAgentDataSourceConfiguration(
  dataSourceConfigSId: string
): Promise<Result<AgentDataSourceConfigurationModel, Error>> {
  const sIdParts = getResourceNameAndIdFromSId(dataSourceConfigSId);
  if (!sIdParts) {
    return new Err(
      new Error(`Invalid data source configuration ID: ${dataSourceConfigSId}`)
    );
  }
  if (sIdParts.resourceName !== "data_source_configuration") {
    return new Err(
      new Error(
        `ID is not a data source configuration ID: ${dataSourceConfigSId}`
      )
    );
  }

  const agentDataSourceConfiguration =
    await AgentDataSourceConfigurationModel.findOne({
      where: {
        id: sIdParts.resourceModelId,
        workspaceId: sIdParts.workspaceModelId,
      },
    });

  if (!agentDataSourceConfiguration) {
    return new Err(
      new Error(`Data source configuration ${dataSourceConfigSId} not found`)
    );
  }

  return new Ok(agentDataSourceConfiguration);
}

export async function fetchTableDataSourceConfigurations(
  auth: Authenticator,
  tablesConfiguration: TablesConfigurationToolType
): Promise<Result<TableDataSourceConfiguration[], Error>> {
  const results: TableDataSourceConfiguration[] = [];

  for (const tableConfiguration of tablesConfiguration) {
    const match = tableConfiguration.uri.match(TABLE_CONFIGURATION_URI_PATTERN);
    if (!match) {
      return new Err(
        new Error(
          `Invalid URI for a table configuration: ${tableConfiguration.uri}`
        )
      );
    }

    const [, workspaceId, tableConfigId, viewId, tableId] = match;

    if (tableConfigId) {
      // Database configuration
      const sIdParts = getResourceNameAndIdFromSId(tableConfigId);
      if (!sIdParts) {
        return new Err(
          new Error(`Invalid table configuration ID: ${tableConfigId}`)
        );
      }
      if (sIdParts.resourceName !== "table_configuration") {
        return new Err(
          new Error(`ID is not a table configuration ID: ${tableConfigId}`)
        );
      }
      if (sIdParts.workspaceModelId !== auth.getNonNullableWorkspace().id) {
        return new Err(
          new Error(
            `Table configuration ${tableConfigId} does not belong to workspace ${sIdParts.workspaceModelId}`
          )
        );
      }

      const agentTableConfiguration =
        await AgentTablesQueryConfigurationTableModel.findOne({
          where: {
            id: sIdParts.resourceModelId,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        });

      if (!agentTableConfiguration) {
        return new Err(
          new Error(`Table configuration ${tableConfigId} not found`)
        );
      }

      // Convert to TableDataSourceConfiguration
      const dataSourceView = await DataSourceViewResource.fetchByModelIds(
        auth,
        [agentTableConfiguration.dataSourceViewId]
      );

      if (dataSourceView.length !== 1) {
        return new Err(
          new Error(
            `Data source view not found for table configuration ${tableConfigId}`
          )
        );
      }

      results.push({
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId: dataSourceView[0].sId,
        tableId: agentTableConfiguration.tableId,
      });
    } else if (viewId && tableId) {
      // Dynamic configuration
      results.push({
        workspaceId,
        dataSourceViewId: viewId,
        tableId,
      });
    } else {
      return new Err(
        new Error(`Invalid URI format: ${tableConfiguration.uri}`)
      );
    }
  }

  return new Ok(results);
}

export type CoreSearchArgs = {
  projectId: string;
  dataSourceId: string;

  filter: {
    tags: {
      in: string[] | null;
      not: string[] | null;
    };
    parents: {
      in: string[] | null;
      not: string[] | null;
    };
  };
  view_filter: CoreAPISearchFilter;
  dataSourceView: DataSourceViewType;
};

type DataSourceConfigInfo =
  | {
      type: "database";
      sId: string;
    }
  | {
      type: "dynamic";
      configuration: DataSourceConfiguration;
    };

export function parseDataSourceConfigurationURI(
  uri: string
): Result<DataSourceConfigInfo, Error> {
  const match = uri.match(DATA_SOURCE_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a data source configuration: ${uri}`)
    );
  }

  const [, workspaceId, sId, viewId, filterStr] = match;

  if (sId) {
    // Database configuration
    return new Ok({
      type: "database",
      sId,
    });
  } else if (viewId && filterStr) {
    // Dynamic configuration
    try {
      const filter = JSON.parse(decodeURIComponent(filterStr));
      return new Ok({
        type: "dynamic",
        configuration: {
          workspaceId,
          dataSourceViewId: viewId,
          filter,
        },
      });
    } catch (e) {
      return new Err(new Error(`Failed to parse filter from URI: ${e}`));
    }
  } else {
    return new Err(new Error(`Invalid URI format: ${uri}`));
  }
}

export async function getAgentDataSourceConfigurations(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<ResolvedDataSourceConfiguration[], MCPError>> {
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
            id: agentConfig.dataSourceViewId,
            workspaceId: agentConfig.workspaceId,
          });

          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            dataSourceViewSId
          );
          if (!dataSourceView || !dataSourceView.canRead(auth)) {
            return new Err(
              new Error(`Data source view not found: ${dataSourceViewSId}`)
            );
          }

          const resolved: ResolvedDataSourceConfiguration = {
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: dataSourceViewSId,
            filter: {
              parents:
                agentConfig.parentsIn !== null ||
                agentConfig.parentsNotIn !== null
                  ? {
                      in: agentConfig.parentsIn ?? [],
                      not: agentConfig.parentsNotIn ?? [],
                    }
                  : null,
              tags:
                agentConfig.tagsIn !== null || agentConfig.tagsNotIn !== null
                  ? {
                      in: agentConfig.tagsIn ?? [],
                      not: agentConfig.tagsNotIn ?? [],
                      mode: agentConfig.tagsMode ?? "custom",
                    }
                  : null,
            },
            dataSource: {
              dustAPIProjectId: dataSourceView.dataSource.dustAPIProjectId,
              dustAPIDataSourceId:
                dataSourceView.dataSource.dustAPIDataSourceId,
              connectorProvider: dataSourceView.dataSource.connectorProvider,
              name: dataSourceView.dataSource.name,
            },
            dataSourceView,
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

          if (!dataSourceView || !dataSourceView.canRead(auth)) {
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
            dataSourceView,
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
    return new Err(new MCPError("Failed to fetch data source configurations."));
  }

  const configs = removeNulls(
    configResults.map((res) => (res.isOk() ? res.value : null))
  );

  if (configs.length === 0) {
    return new Err(
      new MCPError(NO_DATA_SOURCE_AVAILABLE_ERROR, { tracked: false })
    );
  }

  return new Ok(configs);
}

export async function getCoreSearchArgs(
  auth: Authenticator,
  dataSourceConfiguration: DataSourcesToolConfigurationType[number]
): Promise<Result<CoreSearchArgs, Error>> {
  const configRes = await getAgentDataSourceConfigurations(auth, [
    dataSourceConfiguration,
  ]);

  if (configRes.isErr()) {
    return configRes;
  }

  const config = configRes.value[0];

  return new Ok({
    projectId: config.dataSource.dustAPIProjectId,
    dataSourceId: config.dataSource.dustAPIDataSourceId,
    filter: {
      tags: {
        in: config.filter.tags?.in ?? null,
        not: config.filter.tags?.not ?? null,
      },
      parents: {
        in: config.filter.parents?.in ?? null,
        not: config.filter.parents?.not ?? null,
      },
    },
    view_filter: config.dataSourceView.toViewFilter(),
    dataSourceView: config.dataSourceView.toJSON(),
  });
}

export type ProjectConfigInfo = {
  workspaceId: string;
  projectId: string;
};

export function parseProjectConfigurationURI(
  uri: string
): Result<ProjectConfigInfo, Error> {
  const match = uri.match(PROJECT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a project configuration: ${uri}`)
    );
  }

  const [, workspaceId, projectId] = match;

  return new Ok({
    workspaceId,
    projectId,
  });
}
