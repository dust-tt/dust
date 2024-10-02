import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceWithAgentsUsageType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { assertNever, CONNECTOR_PROVIDERS, Err, Ok } from "@dust-tt/types";
import { sortBy, uniq } from "lodash";
import type { WhereAttributeHashValue } from "sequelize";
import { Op, Sequelize } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { isManagedConnectorProvider } from "@app/lib/data_sources";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";

// To use in case of heavy db load emergency with theses usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type DataSourcesUsageByAgent = Record<
  ModelId,
  DataSourceWithAgentsUsageType | null
>;

export async function getDataSourceViewsUsageByCategory({
  auth,
  category,
}: {
  auth: Authenticator;
  category: DataSourceViewCategory;
}): Promise<DataSourcesUsageByAgent> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return {};
  }

  if (DISABLE_QUERIES) {
    return {};
  }

  let connectorProvider: WhereAttributeHashValue<ConnectorProvider | null> =
    null;

  switch (category) {
    case "folder":
      connectorProvider = null;
      break;
    case "website":
      connectorProvider = "webcrawler";
      break;
    case "managed":
      connectorProvider = {
        [Op.in]: CONNECTOR_PROVIDERS.filter(isManagedConnectorProvider),
      };
      break;
    case "apps":
      return {};
    default:
      assertNever(category);
  }

  const res = (await Promise.all([
    AgentDataSourceConfiguration.findAll({
      raw: true,
      group: ["dataSourceView.id"],
      attributes: [
        [Sequelize.col("dataSourceView.id"), "dataSourceViewId"],
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      include: [
        {
          model: DataSourceViewModel,
          as: "dataSourceView",
          attributes: [],
          required: true,
          include: [
            {
              model: DataSourceModel,
              as: "dataSourceForView",
              attributes: [],
              required: true,
              where: {
                connectorProvider: connectorProvider,
              },
            },
          ],
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentDataSourceConfiguration.findAll({
      raw: true,
      group: ["dataSourceView.id"],
      attributes: [
        [Sequelize.col("dataSourceView.id"), "dataSourceViewId"],
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      include: [
        {
          model: DataSourceViewModel,
          as: "dataSourceView",
          attributes: [],
          required: true,
          include: [
            {
              model: DataSourceModel,
              as: "dataSourceForView",
              attributes: [],
              required: true,
              where: {
                connectorProvider: connectorProvider,
              },
            },
          ],
        },
        {
          model: AgentProcessConfiguration,
          as: "agent_process_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentTablesQueryConfigurationTable.findAll({
      raw: true,
      group: ["dataSourceView.id"],
      attributes: [
        [Sequelize.col("dataSourceView.id"), "dataSourceViewId"],
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      include: [
        {
          model: DataSourceViewModel,
          as: "dataSourceView",
          attributes: [],
          required: true,
          include: [
            {
              model: DataSourceModel,
              as: "dataSourceForView",
              attributes: [],
              required: true,
              where: {
                connectorProvider: connectorProvider,
              },
            },
          ],
        },
        {
          model: AgentTablesQueryConfiguration,
          as: "agent_tables_query_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
  ])) as unknown as {
    dataSourceViewId: ModelId;
    names: string[];
  }[][];

  return res.flat().reduce<DataSourcesUsageByAgent>((acc, dsViewConfig) => {
    let usage = acc[dsViewConfig.dataSourceViewId];

    if (!usage) {
      usage = {
        count: 0,
        agentNames: [],
      };
    }

    usage.agentNames = usage.agentNames
      .concat(dsViewConfig.names)
      .filter((t) => t && t.length > 0);
    usage.agentNames = uniq(sortBy(usage.agentNames));
    usage.count = usage.agentNames.length;

    acc[dsViewConfig.dataSourceViewId] = usage;

    return acc;
  }, {});
}

export async function getDataSourcesUsageByCategory({
  auth,
  category,
}: {
  auth: Authenticator;
  category: DataSourceViewCategory;
}): Promise<DataSourcesUsageByAgent> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return {};
  }

  if (DISABLE_QUERIES) {
    return {};
  }

  let connectorProvider: WhereAttributeHashValue<ConnectorProvider | null> =
    null;
  if (category === "folder") {
    connectorProvider = null;
  } else if (category === "website") {
    connectorProvider = "webcrawler";
  } else if (category === "managed") {
    connectorProvider = {
      [Op.in]: CONNECTOR_PROVIDERS.filter(isManagedConnectorProvider),
    };
  }

  const res = (await Promise.all([
    AgentDataSourceConfiguration.findAll({
      raw: true,
      group: ["dataSource.id"],
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      include: [
        {
          model: DataSourceModel,
          as: "dataSource",
          attributes: [],
          required: true,
          where: {
            connectorProvider: connectorProvider,
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentDataSourceConfiguration.findAll({
      raw: true,
      group: ["dataSource.id"],
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      include: [
        {
          model: DataSourceModel,
          as: "dataSource",
          attributes: [],
          required: true,
          where: {
            connectorProvider: connectorProvider,
          },
        },
        {
          model: AgentProcessConfiguration,
          as: "agent_process_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentTablesQueryConfigurationTable.findAll({
      raw: true,
      group: ["dataSource.id"],
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      include: [
        {
          model: DataSourceModel,
          as: "dataSource",
          attributes: [],
          required: true,
          where: {
            connectorProvider: connectorProvider,
          },
        },
        {
          model: AgentTablesQueryConfiguration,
          as: "agent_tables_query_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
  ])) as unknown as {
    dataSourceId: ModelId;
    names: string[];
  }[][];

  return res.flat().reduce<DataSourcesUsageByAgent>((acc, dsConfig) => {
    let usage = acc[dsConfig.dataSourceId];
    if (!usage) {
      usage = {
        count: 0,
        agentNames: [],
      };
    }

    usage.agentNames = usage.agentNames
      .concat(dsConfig.names)
      .filter((t) => t && t.length > 0);
    usage.agentNames = uniq(sortBy(usage.agentNames));
    usage.count = usage.agentNames.length;

    acc[dsConfig.dataSourceId] = usage;
    return acc;
  }, {});
}

export async function getDataSourceUsage({
  auth,
  dataSource,
}: {
  auth: Authenticator;
  dataSource: DataSourceResource;
}): Promise<Result<DataSourceWithAgentsUsageType, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  if (DISABLE_QUERIES) {
    new Ok({ count: 0, agentNames: [] });
  }

  const res = (await Promise.all([
    AgentDataSourceConfiguration.findOne({
      raw: true,
      attributes: [
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      where: {
        dataSourceId: dataSource.id,
      },
      include: [
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentDataSourceConfiguration.findOne({
      raw: true,
      attributes: [
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      where: {
        dataSourceId: dataSource.id,
      },
      include: [
        {
          model: AgentProcessConfiguration,
          as: "agent_process_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentTablesQueryConfigurationTable.findOne({
      raw: true,
      attributes: [
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      where: {
        dataSourceId: dataSource.id,
      },
      include: [
        {
          model: AgentTablesQueryConfiguration,
          as: "agent_tables_query_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
  ])) as unknown as { names: string[] }[] | null;

  if (!res) {
    return new Ok({ count: 0, agentNames: [] });
  } else {
    const agentNames = uniq(
      sortBy(
        res
          .reduce<string[]>((acc, r) => acc.concat(r.names), [])
          .filter((t) => t && t.length > 0)
      )
    );

    return new Ok({ count: agentNames.length, agentNames });
  }
}

export async function getDataSourceViewUsage({
  auth,
  dataSourceView,
}: {
  auth: Authenticator;
  dataSourceView: DataSourceViewResource;
}): Promise<Result<DataSourceWithAgentsUsageType, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  if (DISABLE_QUERIES) {
    new Ok({ count: 0, agentNames: [] });
  }

  const res = (await Promise.all([
    AgentDataSourceConfiguration.findOne({
      raw: true,
      attributes: [
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      where: {
        dataSourceViewId: dataSourceView.id,
      },
      include: [
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentDataSourceConfiguration.findOne({
      raw: true,
      attributes: [
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      where: {
        dataSourceViewId: dataSourceView.id,
      },
      include: [
        {
          model: AgentProcessConfiguration,
          as: "agent_process_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
    AgentTablesQueryConfigurationTable.findOne({
      raw: true,
      attributes: [
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.name"
            )
          ),
          "names",
        ],
      ],
      where: {
        dataSourceViewId: dataSourceView.id,
      },
      include: [
        {
          model: AgentTablesQueryConfiguration,
          as: "agent_tables_query_configuration",
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
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    }),
  ])) as unknown as { names: string[] }[] | null;

  if (!res) {
    return new Ok({ count: 0, agentNames: [] });
  } else {
    const agentNames = uniq(
      sortBy(
        res
          .reduce<string[]>((acc, r) => acc.concat(r.names), [])
          .filter((t) => t && t.length > 0)
      )
    );
    return new Ok({ count: agentNames.length, agentNames });
  }
}
