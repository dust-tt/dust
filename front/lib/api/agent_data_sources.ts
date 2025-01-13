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

// To use in case of heavy db load emergency with these usages queries
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
        ],
      ],
      group: ["dataSourceView.id", "dataSourceView.dataSourceForView.id"],
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
        ],
      ],
      group: ["dataSourceView.id", "dataSourceView.dataSourceForView.id"],
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
        ],
      ],
      group: ["dataSourceView.id", "dataSourceView.dataSourceForView.id"],
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
    scopes: string[];
  }[][];

  return res.flat().reduce<DataSourcesUsageByAgent>((acc, dsViewConfig) => {
    let usage = acc[dsViewConfig.dataSourceViewId];

    if (!usage) {
      usage = {
        totalAgentCount: 0,
        privateAgentCount: 0,
        publicAgentNames: [],
      };
    }

    const validAgents = dsViewConfig.names
      .map((name, i) => ({ name, scope: dsViewConfig.scopes[i] }))
      .filter((agent) => agent.name && agent.name.length > 0);

    usage.publicAgentNames = uniq(
      sortBy([
        ...usage.publicAgentNames,
        ...validAgents
          .filter((agent) => agent.scope !== "private")
          .map((agent) => agent.name),
      ])
    );
    usage.privateAgentCount = validAgents.filter(
      (agent) => agent.scope === "private"
    ).length;
    usage.totalAgentCount = validAgents.length;

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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
        ],
      ],
      group: ["dataSource.id"],
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
        ],
      ],
      group: ["dataSource.id"],
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
        ],
      ],
      group: ["dataSource.id"],
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
    scopes: string[];
  }[][];

  return res.flat().reduce<DataSourcesUsageByAgent>((acc, dsConfig) => {
    let usage = acc[dsConfig.dataSourceId];
    if (!usage) {
      usage = {
        totalAgentCount: 0,
        privateAgentCount: 0,
        publicAgentNames: [],
      };
    }

    const validAgents = dsConfig.names
      .map((name, i) => ({ name, scope: dsConfig.scopes[i] }))
      .filter((agent) => agent.name && agent.name.length > 0);

    usage.publicAgentNames = uniq(
      sortBy([
        ...usage.publicAgentNames,
        ...validAgents
          .filter((agent) => agent.scope !== "private")
          .map((agent) => agent.name),
      ])
    );
    usage.privateAgentCount = validAgents.filter(
      (agent) => agent.scope === "private"
    ).length;
    usage.totalAgentCount = validAgents.length;

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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
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
  ])) as unknown as { names: string[]; scopes: string[] }[] | null;

  if (!res) {
    return new Ok({
      totalAgentCount: 0,
      privateAgentCount: 0,
      publicAgentNames: [],
    });
  } else {
    const validAgents = res.reduce<Array<{ name: string; scope: string }>>(
      (acc, r) => {
        const agents = r.names
          .map((name, i) => ({ name, scope: r.scopes[i] }))
          .filter((agent) => agent.name && agent.name.length > 0);
        return acc.concat(agents);
      },
      []
    );

    const publicAgentNames = uniq(
      sortBy(
        validAgents
          .filter((agent) => agent.scope !== "private")
          .map((agent) => agent.name)
      )
    );

    const privateAgentCount = validAgents.filter(
      (agent) => agent.scope === "private"
    ).length;
    const totalAgentCount = validAgents.length;

    return new Ok({
      totalAgentCount,
      privateAgentCount,
      publicAgentNames,
    });
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_retrieval_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_process_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
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
        [
          Sequelize.fn(
            "array_agg",
            Sequelize.col(
              "agent_tables_query_configuration->agent_configuration.scope"
            )
          ),
          "scopes",
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
  ])) as unknown as { names: string[]; scopes: string[] }[] | null;

  if (!res) {
    return new Ok({
      totalAgentCount: 0,
      privateAgentCount: 0,
      publicAgentNames: [],
    });
  } else {
    const validAgents = res.reduce<Array<{ name: string; scope: string }>>(
      (acc, r) => {
        const agents = r.names
          .map((name, i) => ({ name, scope: r.scopes[i] }))
          .filter((agent) => agent.name && agent.name.length > 0);
        return acc.concat(agents);
      },
      []
    );

    const publicAgentNames = uniq(
      sortBy(
        validAgents
          .filter((agent) => agent.scope !== "private")
          .map((agent) => agent.name)
      )
    );

    const privateAgentCount = validAgents.filter(
      (agent) => agent.scope === "private"
    ).length;
    const totalAgentCount = validAgents.length;

    return new Ok({
      totalAgentCount,
      privateAgentCount,
      publicAgentNames,
    });
  }
}
