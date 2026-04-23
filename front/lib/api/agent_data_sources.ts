import type { Authenticator } from "@app/lib/auth";
import { isManagedConnectorProvider } from "@app/lib/data_sources";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type {
  AgentsUsageType,
  ConnectorProvider,
} from "@app/types/data_source";
import { CONNECTOR_PROVIDERS } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import sortBy from "lodash/sortBy";
import uniqBy from "lodash/uniqBy";
import type { ProjectionAlias, WhereAttributeHashValue } from "sequelize";
import { Op, Sequelize } from "sequelize";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type DataSourcesUsageByAgent = Record<ModelId, AgentsUsageType | null>;

const AGENT_CONFIG_PATH =
  '"agent_mcp_server_configuration->agent_configuration"';

const agentAggregates = (): ProjectionAlias[] =>
  (
    [
      ["name", "names"],
      ["sId", "sIds"],
      ["pictureUrl", "pictureUrls"],
    ] as const
  ).map(([column, alias]) => [
    Sequelize.fn(
      "array_agg",
      Sequelize.literal(
        `${AGENT_CONFIG_PATH}."${column}" ORDER BY ${AGENT_CONFIG_PATH}."name"`
      )
    ),
    alias,
  ]);

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
    case "actions":
      connectorProvider = null;
      break;
    case "triggers":
      connectorProvider = null;
      break;
    default:
      assertNever(category);
  }

  const getAgentsForUser = async () =>
    (await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())).map(
      (g) => g.agentConfigurationId
    );

  const getAgentWhereClauseAdmin = () => ({
    status: "active",
    workspaceId: owner.id,
  });

  const getAgentWhereClauseNonAdmin = async () => ({
    status: "active",
    workspaceId: owner.id,
    // If user is non-admin, only include agents that either they have access to or are published.
    [Op.or]: [
      {
        scope: "visible",
      },
      {
        id: {
          [Op.in]: await getAgentsForUser(),
        },
      },
    ],
  });

  const agentConfigurationInclude = {
    model: AgentConfigurationModel,
    as: "agent_configuration",
    attributes: [],
    required: true,
    where: auth.isAdmin()
      ? getAgentWhereClauseAdmin()
      : await getAgentWhereClauseNonAdmin(),
  };

  const res = (await Promise.all([
    AgentDataSourceConfigurationModel.findAll({
      raw: true,
      group: ["dataSourceView.id"],
      where: {
        workspaceId: owner.id,
      },
      attributes: [
        [Sequelize.col("dataSourceView.id"), "dataSourceViewId"],
        ...agentAggregates(),
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
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [agentConfigurationInclude],
        },
      ],
    }),
    AgentTablesQueryConfigurationTableModel.findAll({
      raw: true,
      group: ["dataSourceView.id"],
      where: {
        workspaceId: owner.id,
      },
      attributes: [
        [Sequelize.col("dataSourceView.id"), "dataSourceViewId"],
        ...agentAggregates(),
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
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
    sIds: string[];
    pictureUrls: string[];
  }[][];

  const result = res
    .flat()
    .reduce<DataSourcesUsageByAgent>((acc, dsViewConfig) => {
      let usage = acc[dsViewConfig.dataSourceViewId];

      if (!usage) {
        usage = {
          count: 0,
          agents: [],
        };
        acc[dsViewConfig.dataSourceViewId] = usage;
      }

      const newAgents = dsViewConfig.sIds
        .map((sId, index) => ({
          sId,
          name: dsViewConfig.names[index],
          pictureUrl: dsViewConfig.pictureUrls[index],
        }))
        .filter(
          (agent) =>
            agent.sId &&
            agent.sId.length > 0 &&
            agent.name &&
            agent.name.length > 0
        );

      usage.agents.push(...newAgents);
      return acc;
    }, {});

  Object.values(result).forEach((usage) => {
    if (usage) {
      usage.agents = sortBy(uniqBy(usage.agents, "sId"), "name");
      usage.count = usage.agents.length;
    }
  });

  return result;
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
    AgentDataSourceConfigurationModel.findAll({
      raw: true,
      group: ["dataSource.id"],
      where: {
        workspaceId: owner.id,
      },
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        ...agentAggregates(),
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
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
    AgentTablesQueryConfigurationTableModel.findAll({
      raw: true,
      group: ["dataSource.id"],
      where: {
        workspaceId: owner.id,
      },
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        ...agentAggregates(),
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
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
    sIds: string[];
    pictureUrls: string[];
  }[][];

  const result = res.flat().reduce<DataSourcesUsageByAgent>((acc, dsConfig) => {
    let usage = acc[dsConfig.dataSourceId];

    if (!usage) {
      usage = {
        count: 0,
        agents: [],
      };
      acc[dsConfig.dataSourceId] = usage;
    }

    const newAgents = dsConfig.sIds
      .map((sId, index) => ({
        sId,
        name: dsConfig.names[index],
        pictureUrl: dsConfig.pictureUrls[index],
      }))
      .filter(
        (agent) =>
          agent.sId &&
          agent.sId.length > 0 &&
          agent.name &&
          agent.name.length > 0
      );

    usage.agents.push(...newAgents);
    return acc;
  }, {});

  Object.values(result).forEach((usage) => {
    if (usage) {
      usage.agents = sortBy(uniqBy(usage.agents, "sId"), "name");
      usage.count = usage.agents.length;
    }
  });

  return result;
}

export async function getDataSourceUsage({
  auth,
  dataSource,
}: {
  auth: Authenticator;
  dataSource: DataSourceResource;
}): Promise<Result<AgentsUsageType, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  if (DISABLE_QUERIES) {
    return new Ok({ count: 0, agents: [] });
  }

  const res = (await Promise.all([
    AgentDataSourceConfigurationModel.findOne({
      raw: true,
      attributes: [...agentAggregates()],
      where: {
        workspaceId: owner.id,
        dataSourceId: dataSource.id,
      },
      include: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
    AgentTablesQueryConfigurationTableModel.findOne({
      raw: true,
      attributes: [...agentAggregates()],
      where: {
        workspaceId: owner.id,
        dataSourceId: dataSource.id,
      },
      include: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
  ])) as unknown as
    | { names: string[]; sIds: string[]; pictureUrls: string[] }[]
    | null;

  if (!res) {
    return new Ok({ count: 0, agents: [] });
  } else {
    const agents = res
      .filter((r) => r && Array.isArray(r.sIds) && Array.isArray(r.names))
      .flatMap((r) =>
        r.sIds.map((sId, index) => ({
          sId,
          name: r.names[index],
          pictureUrl: r.pictureUrls[index],
        }))
      )
      .filter(
        (agent) =>
          agent.sId &&
          agent.sId.length > 0 &&
          agent.name &&
          agent.name.length > 0
      );

    const sortedAgents = sortBy(uniqBy(agents, "sId"), "name");

    return new Ok({
      count: sortedAgents.length,
      agents: sortedAgents,
    });
  }
}

export async function getDataSourceViewUsage({
  auth,
  dataSourceView,
}: {
  auth: Authenticator;
  dataSourceView: DataSourceViewResource;
}): Promise<Result<AgentsUsageType, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  if (DISABLE_QUERIES) {
    return new Ok({ count: 0, agents: [] });
  }

  const res = (await Promise.all([
    AgentDataSourceConfigurationModel.findOne({
      raw: true,
      attributes: [...agentAggregates()],
      where: {
        workspaceId: owner.id,
        dataSourceViewId: dataSourceView.id,
      },
      include: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
    AgentTablesQueryConfigurationTableModel.findOne({
      raw: true,
      attributes: [...agentAggregates()],
      where: {
        workspaceId: owner.id,
        dataSourceViewId: dataSourceView.id,
      },
      include: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "agent_mcp_server_configuration",
          attributes: [],
          required: true,
          include: [
            {
              model: AgentConfigurationModel,
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
  ])) as unknown as
    | { names: string[]; sIds: string[]; pictureUrls: string[] }[]
    | null;

  if (!res) {
    return new Ok({ count: 0, agents: [] });
  } else {
    const agents = res
      .filter((r) => r && Array.isArray(r.sIds) && Array.isArray(r.names))
      .flatMap((r) =>
        r.sIds.map((sId, index) => ({
          sId,
          name: r.names[index],
          pictureUrl: r.pictureUrls[index],
        }))
      )
      .filter(
        (agent) =>
          agent.sId &&
          agent.sId.length > 0 &&
          agent.name &&
          agent.name.length > 0
      );

    const sortedAgents = sortBy(uniqBy(agents, "sId"), "name");

    return new Ok({
      count: sortedAgents.length,
      agents: sortedAgents,
    });
  }
}
