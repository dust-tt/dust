import { shadowUsageConfigIds } from "@app/lib/api/assistant/agent_permissions";
import type { Authenticator } from "@app/lib/auth";
import { isManagedConnectorProvider } from "@app/lib/data_sources";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { UsedBySkillType } from "@app/types/assistant/skill_configuration";
import type {
  AgentsAndSkillsUsageType,
  ConnectorProvider,
} from "@app/types/data_source";
import { CONNECTOR_PROVIDERS } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import sortBy from "lodash/sortBy";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import type { ProjectionAlias, WhereAttributeHashValue } from "sequelize";
import { Op, Sequelize } from "sequelize";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type DataSourcesUsage = Record<ModelId, AgentsAndSkillsUsageType | null>;

type AgentOnlyUsage = {
  count: number;
  agents: { sId: string; name: string; pictureUrl: string }[];
};

const AGENT_CONFIG_PATH =
  '"agent_mcp_server_configuration->agent_configuration"';

const agentAggregates: ProjectionAlias[] = (
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

// Usage only needs each skill's identity, so skip the rest of the hydration.
const SKILL_USAGE_HYDRATION = {
  withInstructions: false,
  withTools: false,
  withFileAttachments: false,
} as const;

/**
 * Buckets skills by the knowledge id they attached, dropping skills the current user may not
 * see. Skills are fetched scoped to `requestedIds`, but each one carries all of its
 * configurations, so ids we did not ask about are skipped here.
 */
function groupSkillsByKnowledgeId(
  auth: Authenticator,
  skills: SkillResource[],
  requestedIds: ModelId[],
  knowledgeIdsOf: (skill: SkillResource) => ModelId[]
): Map<ModelId, UsedBySkillType[]> {
  const visibleSkills = auth.isAdmin()
    ? skills
    : skills.filter(
        (skill) => skill.availability !== "editors" || skill.canWrite(auth)
      );

  const requested = new Set(requestedIds);
  const skillsById = new Map<ModelId, UsedBySkillType[]>();

  for (const skill of visibleSkills) {
    const usedBySkill: UsedBySkillType = {
      sId: skill.sId,
      name: skill.name,
      icon: skill.icon,
    };
    for (const id of new Set(knowledgeIdsOf(skill))) {
      if (!requested.has(id)) {
        continue;
      }
      const usedBySkills = skillsById.get(id) ?? [];
      usedBySkills.push(usedBySkill);
      skillsById.set(id, usedBySkills);
    }
  }

  for (const usedBySkills of skillsById.values()) {
    usedBySkills.sort((a, b) => a.name.localeCompare(b.name));
  }

  return skillsById;
}

/**
 * Skills can attach a data source view directly as "knowledge" (independently of any
 * MCP server/tool configuration). Mirrors `fetchSkillsByMCPServer` in `agent_actions.ts`,
 * but reads `skill.dataSourceConfigurations` instead of `skill.mcpServerViews`.
 */
async function fetchSkillsByDataSourceViewIds(
  auth: Authenticator,
  dataSourceViewIds: ModelId[]
): Promise<Map<ModelId, UsedBySkillType[]>> {
  const skills = await SkillResource.listByDataSourceViewIds(
    auth,
    dataSourceViewIds,
    SKILL_USAGE_HYDRATION
  );

  return groupSkillsByKnowledgeId(auth, skills, dataSourceViewIds, (skill) =>
    skill.dataSourceConfigurations.map((c) => c.dataSourceViewId)
  );
}

async function fetchSkillsByDataSourceIds(
  auth: Authenticator,
  dataSourceIds: ModelId[]
): Promise<Map<ModelId, UsedBySkillType[]>> {
  const skills = await SkillResource.listByDataSourceIds(
    auth,
    dataSourceIds,
    SKILL_USAGE_HYDRATION
  );

  return groupSkillsByKnowledgeId(auth, skills, dataSourceIds, (skill) =>
    skill.dataSourceConfigurations.map((c) => c.dataSourceId)
  );
}

/**
 * Folds a skills-by-id map into an agent-only usage map, bumping `.count` for any id that
 * gains skills.
 */
function mergeSkillsIntoUsage(
  agentOnly: Record<ModelId, AgentOnlyUsage>,
  skillsById: Map<ModelId, UsedBySkillType[]>
): DataSourcesUsage {
  const result: DataSourcesUsage = {};
  for (const key of Object.keys(agentOnly)) {
    const id = Number(key);
    result[id] = { ...agentOnly[id], skills: [] };
  }
  for (const [id, skills] of skillsById) {
    const usage = result[id];
    if (usage) {
      usage.skills = skills;
      usage.count += skills.length;
    } else {
      result[id] = { count: skills.length, agents: [], skills };
    }
  }
  return result;
}

export async function getDataSourceViewsUsageByModelIds({
  auth,
  dataSourceViewModelIds,
}: {
  auth: Authenticator;
  dataSourceViewModelIds: ModelId[];
}): Promise<DataSourcesUsage> {
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

  const uniqueDataSourceViewModelIds = uniq(dataSourceViewModelIds);
  if (uniqueDataSourceViewModelIds.length === 0) {
    return {};
  }

  // Step 1 & 2: fetch the config links from both sources, plus skill usage — nothing here
  // depends on anything else, so fetch them all together instead of sequentially.
  const [dataSourceConfigLinks, tableConfigLinks, skillsByDataSourceViewId] =
    await Promise.all([
      AgentDataSourceConfigurationModel.findAll({
        raw: true,
        attributes: ["dataSourceViewId", "mcpServerConfigurationId"],
        where: {
          workspaceId: owner.id,
          dataSourceViewId: { [Op.in]: uniqueDataSourceViewModelIds },
        },
      }),
      AgentTablesQueryConfigurationTableModel.findAll({
        raw: true,
        attributes: ["dataSourceViewId", "mcpServerConfigurationId"],
        where: {
          workspaceId: owner.id,
          dataSourceViewId: { [Op.in]: uniqueDataSourceViewModelIds },
        },
      }),
      fetchSkillsByDataSourceViewIds(auth, uniqueDataSourceViewModelIds),
    ]);

  // Step 3: fetch the MCP server configuration -> agent configuration mappings
  // once for both sources.
  const mcpServerConfigurationModelIds = uniq(
    removeNulls(
      [...dataSourceConfigLinks, ...tableConfigLinks].map(
        (link) => link.mcpServerConfigurationId
      )
    )
  );

  const mcpConfigs =
    mcpServerConfigurationModelIds.length > 0
      ? await AgentMCPServerConfigurationModel.findAll({
          raw: true,
          attributes: ["id", "agentConfigurationId"],
          where: {
            workspaceId: owner.id,
            id: { [Op.in]: mcpServerConfigurationModelIds },
          },
        })
      : [];

  const mcpConfigByModelId = new Map(
    mcpConfigs.map((config) => [config.id, config])
  );

  // Step 4: fetch the agent configurations
  const getAgentsForUser = async () => {
    const legacy = (
      await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())
    ).map((group) => group.agentConfigurationId);
    return shadowUsageConfigIds(auth, legacy, "getDataSourceViewsUsage");
  };

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

  // 4A. Agents for AgentDataSourceConfigurationModel links.
  const dataSourceAgentConfigurationModelIds = uniq(
    removeNulls(
      dataSourceConfigLinks.map((link) =>
        link.mcpServerConfigurationId === null
          ? undefined
          : mcpConfigByModelId.get(link.mcpServerConfigurationId)
              ?.agentConfigurationId
      )
    )
  );

  const dataSourceAgents =
    dataSourceAgentConfigurationModelIds.length > 0
      ? await AgentConfigurationModel.findAll({
          raw: true,
          attributes: ["id", "sId", "name", "pictureUrl"],
          where: {
            ...(auth.isAdmin()
              ? getAgentWhereClauseAdmin()
              : await getAgentWhereClauseNonAdmin()),
            id: { [Op.in]: dataSourceAgentConfigurationModelIds },
          },
        })
      : [];

  // 4B. Agents for AgentTablesQueryConfigurationTableModel links.
  const tableAgentConfigurationModelIds = uniq(
    removeNulls(
      tableConfigLinks.map(
        (link) =>
          mcpConfigByModelId.get(link.mcpServerConfigurationId)
            ?.agentConfigurationId
      )
    )
  );

  const tableAgents =
    tableAgentConfigurationModelIds.length > 0
      ? await AgentConfigurationModel.findAll({
          raw: true,
          attributes: ["id", "sId", "name", "pictureUrl"],
          where: {
            status: "active",
            workspaceId: owner.id,
            id: { [Op.in]: tableAgentConfigurationModelIds },
          },
        })
      : [];

  // Step 5: join in memory and build the result.
  const dataSourceAgentByModelId = new Map(
    dataSourceAgents.map((agent) => [agent.id, agent])
  );
  const tableAgentByModelId = new Map(
    tableAgents.map((agent) => [agent.id, agent])
  );

  const result: Record<ModelId, AgentOnlyUsage> = {};

  const pushAgentForDataSourceView = ({
    dataSourceViewId,
    agent,
  }: {
    dataSourceViewId: ModelId;
    agent: {
      sId: string;
      name: string;
      pictureUrl: string;
    };
  }) => {
    let usage = result[dataSourceViewId];
    if (!usage) {
      usage = { count: 0, agents: [] };
      result[dataSourceViewId] = usage;
    }

    usage.agents.push({
      sId: agent.sId,
      name: agent.name,
      pictureUrl: agent.pictureUrl,
    });
  };

  for (const link of dataSourceConfigLinks) {
    if (link.mcpServerConfigurationId === null) {
      continue;
    }
    const mcpConfig = mcpConfigByModelId.get(link.mcpServerConfigurationId);
    if (!mcpConfig) {
      continue;
    }
    const agent = dataSourceAgentByModelId.get(mcpConfig.agentConfigurationId);
    if (!agent) {
      continue;
    }
    pushAgentForDataSourceView({
      dataSourceViewId: link.dataSourceViewId,
      agent,
    });
  }

  for (const link of tableConfigLinks) {
    const mcpConfig = mcpConfigByModelId.get(link.mcpServerConfigurationId);
    if (!mcpConfig) {
      continue;
    }
    const agent = tableAgentByModelId.get(mcpConfig.agentConfigurationId);
    if (!agent) {
      continue;
    }
    pushAgentForDataSourceView({
      dataSourceViewId: link.dataSourceViewId,
      agent,
    });
  }

  Object.values(result).forEach((usage) => {
    if (usage) {
      usage.agents = sortBy(uniqBy(usage.agents, "sId"), "name");
      usage.count = usage.agents.length;
    }
  });

  return mergeSkillsIntoUsage(result, skillsByDataSourceViewId);
}

export async function getDataSourcesUsageByCategory({
  auth,
  category,
}: {
  auth: Authenticator;
  category: DataSourceViewCategory;
}): Promise<DataSourcesUsage> {
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

  // The skills lookup is keyed by data source id, so resolve this category's ids first. Same
  // `workspaceId` + `connectorProvider` predicate as the joins below.
  const categoryDataSourceModelIds = (
    await DataSourceModel.findAll({
      raw: true,
      attributes: ["id"],
      where: {
        workspaceId: owner.id,
        connectorProvider,
      },
    })
  ).map((ds) => ds.id);

  const [dataSourceConfigRows, tableConfigRows, skillsByDataSourceId] =
    await Promise.all([
      AgentDataSourceConfigurationModel.findAll({
        raw: true,
        group: ["dataSource.id"],
        where: {
          workspaceId: owner.id,
        },
        attributes: [
          [Sequelize.col("dataSource.id"), "dataSourceId"],
          ...agentAggregates,
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
          ...agentAggregates,
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
      fetchSkillsByDataSourceIds(auth, categoryDataSourceModelIds),
    ] as const);

  const result = (
    [dataSourceConfigRows, tableConfigRows] as unknown as {
      dataSourceId: ModelId;
      names: string[];
      sIds: string[];
      pictureUrls: string[];
    }[][]
  )
    .flat()
    .reduce<Record<ModelId, AgentOnlyUsage>>((acc, dsConfig) => {
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

  return mergeSkillsIntoUsage(result, skillsByDataSourceId);
}

export async function getDataSourceUsage({
  auth,
  dataSource,
}: {
  auth: Authenticator;
  dataSource: DataSourceResource;
}): Promise<Result<AgentsAndSkillsUsageType, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  if (DISABLE_QUERIES) {
    return new Ok({ count: 0, agents: [], skills: [] });
  }

  const [dataSourceConfigRow, tableConfigRow, skillsByDataSourceId] =
    await Promise.all([
      AgentDataSourceConfigurationModel.findOne({
        raw: true,
        attributes: [...agentAggregates],
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
        attributes: [...agentAggregates],
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
      fetchSkillsByDataSourceIds(auth, [dataSource.id]),
    ]);

  const skills = skillsByDataSourceId.get(dataSource.id) ?? [];
  const res = [dataSourceConfigRow, tableConfigRow] as unknown as
    | { names: string[]; sIds: string[]; pictureUrls: string[] }[]
    | null;

  if (!res) {
    return new Ok({ count: skills.length, agents: [], skills });
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
      count: sortedAgents.length + skills.length,
      agents: sortedAgents,
      skills,
    });
  }
}

export async function getDataSourceViewUsage({
  auth,
  dataSourceView,
}: {
  auth: Authenticator;
  dataSourceView: DataSourceViewResource;
}): Promise<Result<AgentsAndSkillsUsageType, Error>> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  if (DISABLE_QUERIES) {
    return new Ok({ count: 0, agents: [], skills: [] });
  }

  const [dataSourceConfigRow, tableConfigRow, skillsByDataSourceViewId] =
    await Promise.all([
      AgentDataSourceConfigurationModel.findOne({
        raw: true,
        attributes: [...agentAggregates],
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
        attributes: [...agentAggregates],
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
      fetchSkillsByDataSourceViewIds(auth, [dataSourceView.id]),
    ]);

  const skills = skillsByDataSourceViewId.get(dataSourceView.id) ?? [];
  const res = [dataSourceConfigRow, tableConfigRow] as unknown as
    | { names: string[]; sIds: string[]; pictureUrls: string[] }[]
    | null;

  if (!res) {
    return new Ok({ count: skills.length, agents: [], skills });
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
      count: sortedAgents.length + skills.length,
      agents: sortedAgents,
      skills,
    });
  }
}
