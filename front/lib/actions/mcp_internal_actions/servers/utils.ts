import { renderDataSourceConfiguration } from "@app/lib/actions/configuration/helpers";
import type {
  DataSourcesToolConfigurationType,
  TablesConfigurationToolType,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  DATA_SOURCE_CONFIGURATION_URI_PATTERN,
  TABLE_CONFIGURATION_URI_PATTERN,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  ConnectorProvider,
  CoreAPISearchFilter,
  DataSourceViewType,
  Result,
} from "@app/types";
import { assertNever, Err, Ok, removeNulls } from "@app/types";

// Type to represent data source configuration with resolved data source model
export type ResolvedDataSourceConfiguration = DataSourceConfiguration & {
  dataSource: {
    dustAPIProjectId: string;
    dustAPIDataSourceId: string;
    connectorProvider: ConnectorProvider | null;
    name: string;
  };
};

export function makeDataSourceViewFilter(
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[]
) {
  return agentDataSourceConfigurations.map(({ dataSource, filter }) => ({
    data_source_id: dataSource.dustAPIDataSourceId,
    view_filter: filter.parents?.in ?? [],
  }));
}

async function fetchAgentDataSourceConfiguration(
  dataSourceConfigSId: string
): Promise<Result<AgentDataSourceConfiguration, Error>> {
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
    await AgentDataSourceConfiguration.findOne({
      where: {
        id: sIdParts.resourceModelId,
        workspaceId: sIdParts.workspaceModelId,
      },
      nest: true,
      include: [
        { model: DataSourceModel, as: "dataSource", required: true },
        {
          model: DataSourceViewModel,
          as: "dataSourceView",
          required: true,
          include: [{ model: WorkspaceModel, as: "workspace", required: true }],
        },
      ],
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
        await AgentTablesQueryConfigurationTable.findOne({
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

type CoreSearchArgs = {
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

export async function getDataSourceConfiguration(
  dataSourceToolConfiguration: DataSourcesToolConfigurationType[number]
): Promise<Result<DataSourceConfiguration, Error>> {
  const configInfoRes = parseDataSourceConfigurationURI(
    dataSourceToolConfiguration.uri
  );

  if (configInfoRes.isErr()) {
    return configInfoRes;
  }

  const configInfo = configInfoRes.value;

  switch (configInfo.type) {
    case "database": {
      const r = await fetchAgentDataSourceConfiguration(configInfo.sId);
      if (r.isErr()) {
        return r;
      }
      const agentDataSourceConfiguration = r.value;
      return new Ok(
        renderDataSourceConfiguration(agentDataSourceConfiguration)
      );
    }

    case "dynamic": {
      // Dynamic configuration - return directly
      return new Ok(configInfo.configuration);
    }

    default:
      assertNever(configInfo);
  }
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

export async function getCoreSearchArgs(
  auth: Authenticator,
  dataSourceConfiguration: DataSourcesToolConfigurationType[number]
): Promise<Result<CoreSearchArgs, Error>> {
  const configInfoRes = parseDataSourceConfigurationURI(
    dataSourceConfiguration.uri
  );

  if (configInfoRes.isErr()) {
    return configInfoRes;
  }

  const configInfo = configInfoRes.value;

  switch (configInfo.type) {
    case "database": {
      const r = await fetchAgentDataSourceConfiguration(configInfo.sId);

      if (r.isErr()) {
        return r;
      }

      const agentDataSourceConfiguration = r.value;
      const dataSource = agentDataSourceConfiguration.dataSource;

      const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
        auth,
        [agentDataSourceConfiguration.dataSourceViewId]
      );
      if (dataSourceViews.length !== 1) {
        return new Err(
          new Error(
            `Expected 1 data source view, got ${dataSourceViews.length}`
          )
        );
      }
      const dataSourceView = dataSourceViews[0];

      return new Ok({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        filter: {
          tags: {
            in: agentDataSourceConfiguration.tagsIn,
            not: agentDataSourceConfiguration.tagsNotIn,
          },
          parents: {
            in: agentDataSourceConfiguration.parentsIn,
            not: agentDataSourceConfiguration.parentsNotIn,
          },
        },
        view_filter: dataSourceView.toViewFilter(),
        dataSourceView: dataSourceView.toJSON(),
      });
    }

    case "dynamic": {
      // Dynamic configuration
      const config = configInfo.configuration;

      // Fetch the data source view by ID
      const dataSourceView = await DataSourceViewResource.fetchById(
        auth,
        config.dataSourceViewId
      );

      if (!dataSourceView) {
        return new Err(
          new Error(`Data source view not found: ${config.dataSourceViewId}`)
        );
      }

      const dataSource = dataSourceView.dataSource;

      return new Ok({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        filter: {
          tags: {
            in: config.filter.tags?.in || null,
            not: config.filter.tags?.not || null,
          },
          parents: {
            in: config.filter.parents?.in || null,
            not: config.filter.parents?.not || null,
          },
        },
        view_filter: dataSourceView.toViewFilter(),
        dataSourceView: dataSourceView.toJSON(),
      });
    }

    default:
      assertNever(configInfo);
  }
}

function hasTagAutoMode(dataSourceConfigurations: DataSourceConfiguration[]) {
  return dataSourceConfigurations.some(
    (dataSourceConfiguration) =>
      dataSourceConfiguration.filter.tags?.mode === "auto"
  );
}

export function shouldAutoGenerateTags(
  agentLoopContext: AgentLoopContextType
): boolean {
  const { listToolsContext, runContext } = agentLoopContext;
  if (
    !!listToolsContext?.agentActionConfiguration &&
    isServerSideMCPServerConfiguration(
      listToolsContext.agentActionConfiguration
    ) &&
    !!listToolsContext.agentActionConfiguration.dataSources
  ) {
    return hasTagAutoMode(
      listToolsContext.agentActionConfiguration.dataSources
    );
  } else if (
    !!runContext?.actionConfiguration &&
    isServerSideMCPToolConfiguration(runContext.actionConfiguration) &&
    !!runContext.actionConfiguration.dataSources
  ) {
    return hasTagAutoMode(runContext.actionConfiguration.dataSources);
  }

  return false;
}

/**
 * Checks for conflicting tags across core search arguments and returns an error message if any.
 * If a tag is both included and excluded, we will not get any result.
 */
export function checkConflictingTags(
  coreSearchArgs: CoreSearchArgs[],
  { tagsIn, tagsNot }: { tagsIn?: string[]; tagsNot?: string[] }
): string | null {
  for (const args of coreSearchArgs) {
    const configTagsIn = args.filter.tags?.in ?? [];
    const configTagsNot = args.filter.tags?.not ?? [];

    const finalTagsIn = [...configTagsIn, ...(tagsIn ?? [])];
    const finalTagsNot = [...configTagsNot, ...(tagsNot ?? [])];

    const conflictingTags = finalTagsIn.filter((tag) =>
      finalTagsNot.includes(tag)
    );
    if (conflictingTags.length > 0) {
      const conflictingTagsList = conflictingTags.join(", ");
      const tagsInList =
        configTagsIn.length > 0 ? configTagsIn.join(", ") : "none";
      const tagsNotList =
        configTagsNot.length > 0 ? configTagsNot.join(", ") : "none";

      // We actually return even if we get one conflict.
      // We can have a conflict only if the agent created one by passing some tags without being
      // aware that it would create a conflict with a configured tag.
      // The rationale behind it is that there is a low overlap between the tags across data
      // sources. Therefore, even if we did have some content in another data source, it is
      // probably not what the agent intended and its filtering had no use.
      return (
        "No results were found due to conflicting tags. The following tags appear in both " +
        `include and exclude lists: ${conflictingTagsList}.\n\nTags that are already included: ` +
        `${tagsInList}\n Tags that are already excluded ${tagsNotList}\n\nPlease adjust your ` +
        "tag filters to avoid conflicts."
      );
    }
  }

  return null;
}
