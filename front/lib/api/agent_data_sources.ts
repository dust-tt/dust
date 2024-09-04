import type {
  ConnectorProvider,
  DataSourceType,
  DataSourceViewType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { DataSource } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";

export type DataSourcesUsageByAgent = Record<ModelId, number>;

// TODO(GROUPS_INFRA) Add support for views here.
export async function getDataSourcesUsageByAgents({
  auth,
  providerFilter,
}: {
  auth: Authenticator;
  providerFilter: ConnectorProvider | null;
}): Promise<DataSourcesUsageByAgent> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return {};
  }

  const agentDataSourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        [Sequelize.fn("COUNT", Sequelize.col("dataSource.id")), "count"],
      ],
      include: [
        {
          model: DataSource,
          as: "dataSource",
          attributes: [],
          required: true,
          where: {
            workspaceId: owner.id,
            connectorProvider: providerFilter,
          },
        },
        {
          model: AgentRetrievalConfiguration,
          as: "agent_retrieval_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfiguration,
              as: "agent_configuration",
              attributes: [],
              required: true,
              where: {
                status: "active",
              },
            },
          ],
        },
      ],
      group: ["dataSource.id"],
      raw: true,
    });
  return agentDataSourceConfigurations.reduce<DataSourcesUsageByAgent>(
    (acc, dsConfig) => {
      acc[dsConfig.dataSourceId] = (
        dsConfig as unknown as { count: number }
      ).count;
      return acc;
    },
    {}
  );
}

export async function getDataSourceUsage({
  auth,
  dataSource,
}: {
  auth: Authenticator;
  dataSource: DataSourceType;
}): Promise<Result<number, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  return new Ok(
    await AgentDataSourceConfiguration.count({
      where: {
        dataSourceId: dataSource.id,
      },
      include: [
        {
          model: DataSource,
          as: "dataSource",
          where: {
            workspaceId: owner.id,
          },
          attributes: [],
        },
        {
          model: AgentRetrievalConfiguration,
          as: "agent_retrieval_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfiguration,
              as: "agent_configuration",
              attributes: [],
              required: true,
              where: {
                status: "active",
              },
            },
          ],
        },
      ],
    })
  );
}

export async function getDataSourceViewUsage({
  auth,
  dataSourceView,
}: {
  auth: Authenticator;
  dataSourceView: DataSourceViewType;
}): Promise<Result<number, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  return new Ok(
    await AgentDataSourceConfiguration.count({
      where: {
        dataSourceViewId: dataSourceView.id,
      },
      include: [
        {
          model: DataSourceViewModel,
          as: "dataSourceView",
          where: {
            workspaceId: owner.id,
          },
          attributes: [],
        },
        {
          model: AgentRetrievalConfiguration,
          as: "agent_retrieval_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfiguration,
              as: "agent_configuration",
              attributes: [],
              required: true,
              where: {
                status: "active",
              },
            },
          ],
        },
      ],
    })
  );
}
