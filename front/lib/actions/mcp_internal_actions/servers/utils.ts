import {
  DATA_SOURCE_CONFIGURATION_URI_PATTERN,
  TABLE_CONFIGURATION_URI_PATTERN,
} from "@dust-tt/client";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type {
  CoreAPISearchFilter,
  DataSourceViewType,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";

export async function fetchAgentDataSourceConfiguration(
  uri: string
): Promise<Result<AgentDataSourceConfiguration, Error>> {
  const match = uri.match(DATA_SOURCE_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a data source configuration: ${uri}`)
    );
  }

  // It's safe to do this because the inputs are already checked against the zod schema here.
  const [, , dataSourceConfigId] = match;
  const sIdParts = getResourceNameAndIdFromSId(dataSourceConfigId);
  if (!sIdParts) {
    return new Err(
      new Error(`Invalid data source configuration ID: ${dataSourceConfigId}`)
    );
  }
  if (sIdParts.resourceName !== "data_source_configuration") {
    return new Err(
      new Error(
        `ID is not a data source configuration ID: ${dataSourceConfigId}`
      )
    );
  }

  const agentDataSourceConfiguration =
    await AgentDataSourceConfiguration.findByPk(sIdParts.resourceModelId, {
      nest: true,
      include: [{ model: DataSourceModel, as: "dataSource", required: true }],
    });

  if (
    agentDataSourceConfiguration &&
    agentDataSourceConfiguration.workspaceId !== sIdParts.workspaceModelId
  ) {
    return new Err(
      new Error(
        `Data source configuration ${dataSourceConfigId} does not belong to workspace ${sIdParts.workspaceModelId}`
      )
    );
  }

  if (!agentDataSourceConfiguration) {
    return new Err(
      new Error(`Data source configuration ${dataSourceConfigId} not found`)
    );
  }

  return new Ok(agentDataSourceConfiguration);
}

export async function fetchAgentTableConfigurations(
  auth: Authenticator,
  uris: string[]
): Promise<Result<AgentTablesQueryConfigurationTable[], Error>> {
  const configurationIds = [];
  for (const uri of uris) {
    const match = uri.match(TABLE_CONFIGURATION_URI_PATTERN);
    if (!match) {
      return new Err(
        new Error(`Invalid URI for a table configuration: ${uri}`)
      );
    }
    // Safe to do because the inputs are already checked against the zod schema here.
    const [, , tableConfigId] = match;
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
    configurationIds.push(sIdParts.resourceModelId);
  }

  const agentTableConfigurations =
    await AgentTablesQueryConfigurationTable.findAll({
      where: {
        id: { [Op.in]: configurationIds },
      },
    });

  return new Ok(agentTableConfigurations);
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
// TODO(mcp): update to fetch multiple uris at once.
export async function getCoreSearchArgs(
  auth: Authenticator,
  uri: string
): Promise<Result<CoreSearchArgs, Error>> {
  const r = await fetchAgentDataSourceConfiguration(uri);

  if (r.isErr()) {
    return r;
  }

  const agentDataSourceConfiguration = r.value;
  const dataSource = agentDataSourceConfiguration.dataSource;

  const dataSourceViews = await DataSourceViewResource.fetchByModelIds(auth, [
    agentDataSourceConfiguration.dataSourceViewId,
  ]);
  if (dataSourceViews.length !== 1) {
    return new Err(
      new Error(`Expected 1 data source view, got ${dataSourceViews.length}`)
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
