import type {
  AgentActionConfigurationType,
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentMention,
  AgentModelConfigurationType,
  AgentsGetViewType,
  AgentStatus,
  AgentUserListStatus,
  AppType,
  DataSourceConfiguration,
  LightAgentConfigurationType,
  ModelId,
  ProcessSchemaPropertyType,
  ProcessTagsFilter,
  Result,
  RetrievalQuery,
  RetrievalTimeframe,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  Err,
  isTimeFrame,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  Ok,
} from "@dust-tt/types";
import * as _ from "lodash";
import type { Order, Transaction } from "sequelize";
import { Op, Sequelize, UniqueConstraintError } from "sequelize";

import {
  DEFAULT_BROWSE_ACTION_NAME,
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_VISUALIZATION_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/names";
import {
  getGlobalAgents,
  isGlobalAgentId,
} from "@app/lib/api/assistant/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import { agentUserListStatus } from "@app/lib/api/assistant/user_relation";
import { compareAgentsForSort } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { App } from "@app/lib/models/apps";
import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentVisualizationConfiguration } from "@app/lib/models/assistant/actions/visualization";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import {
  Conversation,
  Mention,
  Message,
} from "@app/lib/models/assistant/conversation";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { TemplateResource } from "@app/lib/resources/template_resource";

type SortStrategyType = "alphabetical" | "priority" | "updatedAt";

interface SortStrategy {
  dbOrder: Order | undefined;
  compareFunction: (
    a: AgentConfigurationType,
    b: AgentConfigurationType
  ) => number;
}

const sortStrategies: Record<SortStrategyType, SortStrategy> = {
  alphabetical: {
    dbOrder: [["name", "ASC"]],
    compareFunction: (a: AgentConfigurationType, b: AgentConfigurationType) =>
      a.name.localeCompare(b.name),
  },
  priority: {
    dbOrder: [["name", "ASC"]],
    compareFunction: compareAgentsForSort,
  },
  updatedAt: {
    dbOrder: [["updatedAt", "DESC"]],
    compareFunction: () => 0,
  },
};

/**
 * Get an agent configuration
 *
 */
export async function getAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType | null> {
  const res = await getAgentConfigurations({
    auth,
    agentsGetView: { agentId },
    variant: "full",
  });
  return res[0] || null;
}

function makeApplySortAndLimit(sort?: SortStrategyType, limit?: number) {
  return (results: AgentConfigurationType[]) => {
    const sortStrategy = sort && sortStrategies[sort];

    const sortedResults = sortStrategy
      ? results.sort(sortStrategy.compareFunction)
      : results;

    return limit ? sortedResults.slice(0, limit) : sortedResults;
  };
}

export async function getLightAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<LightAgentConfigurationType | null> {
  const res = await getAgentConfigurations({
    auth,
    agentsGetView: { agentId },
    variant: "light",
  });
  return res[0] || null;
}

// Global agent configurations.

function determineGlobalAgentIdsToFetch(
  agentsGetView: AgentsGetViewType
): string[] | undefined {
  switch (agentsGetView) {
    case "workspace":
    case "published":
    case "archived":
      return []; // fetch no global agents
    case "global":
    case "list":
    case "all":
    case "admin_internal":
    case "assistants-search":
      return undefined; // undefined means all global agents will be fetched
    default:
      if (
        typeof agentsGetView === "object" &&
        "conversationId" in agentsGetView
      ) {
        // All global agents in conversation view.
        return undefined;
      }
      if (typeof agentsGetView === "object" && "agentId" in agentsGetView) {
        if (isGlobalAgentId(agentsGetView.agentId)) {
          // In agentId view, only get the global agent with the provided id if it is a global agent.
          return [agentsGetView.agentId];
        }
        // In agentId view, don't get any global agents if it is not a global agent.
        return [];
      }
      assertNever(agentsGetView);
  }
}

async function fetchGlobalAgentConfigurationForView(
  auth: Authenticator,
  {
    agentPrefix,
    agentsGetView,
  }: {
    agentPrefix?: string;
    agentsGetView: AgentsGetViewType;
  }
) {
  const globalAgentIdsToFetch = determineGlobalAgentIdsToFetch(agentsGetView);
  const allGlobalAgents = await getGlobalAgents(auth, globalAgentIdsToFetch);
  const matchingGlobalAgents = allGlobalAgents.filter(
    (a) =>
      (!agentPrefix ||
        a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())) &&
      !(a.status === "disabled_missing_datasource")
  );

  if (
    agentsGetView === "global" ||
    (typeof agentsGetView === "object" && "agentId" in agentsGetView)
  ) {
    // All global agents in global and agent views.
    return matchingGlobalAgents;
  }

  // If not in global or agent view, filter out global agents that are not active.
  return matchingGlobalAgents.filter((a) => a.status === "active");
}

// Workspace agent configurations.

async function fetchAgentConfigurationsForView(
  auth: Authenticator,
  {
    agentPrefix,
    agentsGetView,
    limit,
    owner,
    sort,
  }: {
    agentPrefix?: string;
    agentsGetView: Exclude<AgentsGetViewType, "global">;
    limit?: number;
    owner: WorkspaceType;
    sort?: SortStrategyType;
  }
): Promise<AgentConfiguration[]> {
  const sortStrategy = sort && sortStrategies[sort];

  const baseWhereConditions = {
    workspaceId: owner.id,
    status: "active",
    ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
  };

  const baseAgentsSequelizeQuery = {
    limit,
    order: sortStrategy?.dbOrder,
  };

  const baseConditionsAndScopesIn = (scopes: string[]) => ({
    ...baseWhereConditions,
    scope: { [Op.in]: scopes },
  });

  switch (agentsGetView) {
    case "admin_internal":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseWhereConditions,
      });
    case "archived":
      // Get the latest version of all archived agents.
      // For each sId, we want to fetch the one with the highest version, only if it's status is "archived".
      return AgentConfiguration.findAll({
        attributes: [[Sequelize.fn("MAX", Sequelize.col("id")), "maxId"]],
        group: "sId",
        raw: true,
        where: {
          workspaceId: owner.id,
        },
      }).then(async (result) => {
        const maxIds = result.map(
          (entry) => (entry as unknown as { maxId: number }).maxId
        );

        return AgentConfiguration.findAll({
          where: {
            id: {
              [Op.in]: maxIds,
            },
            status: "archived",
          },
        });
      });

    case "all":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["workspace", "published"]),
      });

    case "workspace":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["workspace"]),
      });

    case "published":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["published"]),
      });

    case "assistants-search":
    case "list":
      const user = auth.user();

      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: {
          ...baseWhereConditions,
          [Op.or]: [
            { scope: { [Op.in]: ["workspace", "published"] } },
            { authorId: user?.id },
          ],
        },
      });

    default:
      if (typeof agentsGetView === "object" && "agentId" in agentsGetView) {
        if (isGlobalAgentId(agentsGetView.agentId)) {
          return Promise.resolve([]);
        }
        return AgentConfiguration.findAll({
          where: {
            workspaceId: owner.id,
            ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
            sId: agentsGetView.agentId,
          },
          order: [["version", "DESC"]],
          ...(agentsGetView.allVersions ? {} : { limit: 1 }),
        });
      } else if (
        typeof agentsGetView === "object" &&
        "conversationId" in agentsGetView
      ) {
        const user = auth.user();

        return AgentConfiguration.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseWhereConditions,
            [Op.or]: [
              { scope: { [Op.in]: ["workspace", "published"] } },
              { authorId: user?.id },
            ],
          },
        });
      }
      assertNever(agentsGetView);
  }
}

async function fetchWorkspaceAgentConfigurationsForView(
  auth: Authenticator,
  owner: WorkspaceType,
  {
    agentPrefix,
    agentsGetView,
    limit,
    sort,
    variant,
  }: {
    agentPrefix?: string;
    agentsGetView: Exclude<AgentsGetViewType, "global">;
    limit?: number;
    sort?: SortStrategyType;
    variant: "light" | "full";
  }
) {
  const user = auth.user();

  const agentConfigurations = await fetchAgentConfigurationsForView(auth, {
    agentPrefix,
    agentsGetView,
    limit,
    owner,
    sort,
  });

  const configurationIds = agentConfigurations.map((a) => a.id);
  const configurationSIds = agentConfigurations.map((a) => a.sId);

  function groupByAgentConfigurationId<
    T extends { agentConfigurationId: number },
  >(list: T[]): Record<number, T[]> {
    return _.groupBy(list, "agentConfigurationId");
  }

  const [
    retrievalConfigs,
    dustAppRunConfigs,
    tablesQueryConfigs,
    processConfigs,
    websearchConfigs,
    browseConfigs,
    visualizationConfigs,
    agentUserRelations,
  ] = await Promise.all([
    variant === "full"
      ? AgentRetrievalConfiguration.findAll({
          where: { agentConfigurationId: { [Op.in]: configurationIds } },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve({} as Record<number, AgentRetrievalConfiguration[]>),
    variant === "full"
      ? AgentDustAppRunConfiguration.findAll({
          where: { agentConfigurationId: { [Op.in]: configurationIds } },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve({} as Record<number, AgentDustAppRunConfiguration[]>),
    variant === "full"
      ? AgentTablesQueryConfiguration.findAll({
          where: {
            agentConfigurationId: { [Op.in]: configurationIds },
          },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve({} as Record<number, AgentTablesQueryConfiguration[]>),
    variant === "full"
      ? AgentProcessConfiguration.findAll({
          where: {
            agentConfigurationId: { [Op.in]: configurationIds },
          },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve({} as Record<number, AgentProcessConfiguration[]>),
    variant === "full"
      ? AgentWebsearchConfiguration.findAll({
          where: {
            agentConfigurationId: { [Op.in]: configurationIds },
          },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve({} as Record<number, AgentWebsearchConfiguration[]>),
    variant === "full"
      ? AgentBrowseConfiguration.findAll({
          where: {
            agentConfigurationId: { [Op.in]: configurationIds },
          },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve({} as Record<number, AgentBrowseConfiguration[]>),
    variant === "full"
      ? AgentVisualizationConfiguration.findAll({
          where: {
            agentConfigurationId: { [Op.in]: configurationIds },
          },
        }).then(groupByAgentConfigurationId)
      : Promise.resolve(
          {} as Record<number, AgentVisualizationConfiguration[]>
        ),
    user && configurationIds.length > 0
      ? AgentUserRelation.findAll({
          where: {
            agentConfiguration: { [Op.in]: configurationSIds },
            userId: user.id,
          },
        }).then((relations) =>
          relations.reduce(
            (acc, relation) => {
              acc[relation.agentConfiguration] = relation;
              return acc;
            },
            {} as Record<string, AgentUserRelation>
          )
        )
      : Promise.resolve({} as Record<string, AgentUserRelation>),
  ]);

  const retrievalDatasourceConfigurationsPromise = (
    Object.values(retrievalConfigs).length
      ? AgentDataSourceConfiguration.findAll({
          where: {
            retrievalConfigurationId: {
              [Op.in]: Object.values(retrievalConfigs).flatMap((r) =>
                r.map((c) => c.id)
              ),
            },
          },
          include: [
            {
              model: DataSource,
              as: "dataSource",
              include: [
                {
                  model: Workspace,
                  as: "workspace",
                },
              ],
            },
          ],
        })
      : Promise.resolve([])
  ).then((dsConfigs) => _.groupBy(dsConfigs, "retrievalConfigurationId"));

  const processDatasourceConfigurationsPromise = (
    Object.values(processConfigs).length
      ? AgentDataSourceConfiguration.findAll({
          where: {
            processConfigurationId: {
              [Op.in]: Object.values(processConfigs).flatMap((r) =>
                r.map((c) => c.id)
              ),
            },
          },
          include: [
            {
              model: DataSource,
              as: "dataSource",
              include: [
                {
                  model: Workspace,
                  as: "workspace",
                },
              ],
            },
          ],
        })
      : Promise.resolve([])
  ).then((dsConfigs) => _.groupBy(dsConfigs, "processConfigurationId"));

  const agentTablesQueryConfigurationTablesPromise = (
    Object.values(tablesQueryConfigs).length
      ? AgentTablesQueryConfigurationTable.findAll({
          where: {
            tablesQueryConfigurationId: {
              [Op.in]: Object.values(tablesQueryConfigs).flatMap((r) =>
                r.map((c) => c.id)
              ),
            },
          },
        })
      : Promise.resolve([])
  ).then((tablesConfigs) =>
    _.groupBy(tablesConfigs, "tablesQueryConfigurationId")
  );

  const dustAppsPromise = Object.values(dustAppRunConfigs).length
    ? App.findAll({
        where: {
          sId: {
            [Op.in]: Object.values(dustAppRunConfigs).flatMap((r) =>
              r.map((c) => c.appId)
            ),
          },
        },
      })
    : Promise.resolve([]);

  const [
    retrievalDatasourceConfigurations,
    processDatasourceConfigurations,
    agentTablesConfigurationTables,
    dustApps,
  ] = await Promise.all([
    retrievalDatasourceConfigurationsPromise,
    processDatasourceConfigurationsPromise,
    agentTablesQueryConfigurationTablesPromise,
    dustAppsPromise,
  ]);

  let agentConfigurationTypes: AgentConfigurationType[] = [];
  for (const agent of agentConfigurations) {
    const actions: AgentActionConfigurationType[] = [];

    if (variant === "full") {
      const retrievalConfigurations = retrievalConfigs[agent.id] ?? [];
      for (const retrievalConfig of retrievalConfigurations) {
        const dataSourcesConfig =
          retrievalDatasourceConfigurations[retrievalConfig.id] ?? [];
        let topK: number | "auto" = "auto";
        if (retrievalConfig.topKMode === "custom") {
          if (!retrievalConfig.topK) {
            // unreachable
            throw new Error(
              `Couldn't find topK for retrieval configuration ${retrievalConfig.id}} with 'custom' topK mode`
            );
          }

          topK = retrievalConfig.topK;
        }
        actions.push({
          id: retrievalConfig.id,
          sId: retrievalConfig.sId,
          type: "retrieval_configuration",
          query: retrievalConfig.query,
          relativeTimeFrame: renderRetrievalTimeframeType(retrievalConfig),
          topK,
          dataSources: dataSourcesConfig.map((dsConfig) => {
            return {
              dataSourceId: dsConfig.dataSource.name,
              workspaceId: dsConfig.dataSource.workspace.sId,
              filter: {
                parents:
                  dsConfig.parentsIn && dsConfig.parentsNotIn
                    ? { in: dsConfig.parentsIn, not: dsConfig.parentsNotIn }
                    : null,
              },
            };
          }),
          name: retrievalConfig.name || DEFAULT_RETRIEVAL_ACTION_NAME,
          description: retrievalConfig.description,
        });
      }

      const dustAppRunConfigurations = dustAppRunConfigs[agent.id] ?? [];
      for (const dustAppRunConfig of dustAppRunConfigurations) {
        const dustApp = dustApps.find(
          (app) => app.sId === dustAppRunConfig.appId
        );
        if (!dustApp) {
          // unreachable
          throw new Error(
            `Couldn't find dust app for dust app run configuration ${dustAppRunConfig.id}`
          );
        }
        actions.push({
          id: dustAppRunConfig.id,
          sId: dustAppRunConfig.sId,
          type: "dust_app_run_configuration",
          appWorkspaceId: dustAppRunConfig.appWorkspaceId,
          appId: dustAppRunConfig.appId,
          name: dustApp.name,
          description: dustApp.description,
        });
      }

      const websearchConfigurations = websearchConfigs[agent.id] ?? [];
      for (const websearchConfig of websearchConfigurations) {
        actions.push({
          id: websearchConfig.id,
          sId: websearchConfig.sId,
          type: "websearch_configuration",
          name: websearchConfig.name || DEFAULT_WEBSEARCH_ACTION_NAME,
          description: websearchConfig.description,
        });
      }

      const browseConfigurations = browseConfigs[agent.id] ?? [];
      for (const browseConfig of browseConfigurations) {
        actions.push({
          id: browseConfig.id,
          sId: browseConfig.sId,
          type: "browse_configuration",
          name: browseConfig.name || DEFAULT_BROWSE_ACTION_NAME,
          description: browseConfig.description,
        });
      }

      const visualizationConfigurations = visualizationConfigs[agent.id] ?? [];
      for (const visualizationConfig of visualizationConfigurations) {
        actions.push({
          id: visualizationConfig.id,
          sId: visualizationConfig.sId,
          type: "visualization_configuration",
          name: visualizationConfig.name || DEFAULT_VISUALIZATION_ACTION_NAME,
          description: visualizationConfig.description,
        });
      }

      const tablesQueryConfigurations = tablesQueryConfigs[agent.id] ?? [];
      for (const tablesQueryConfig of tablesQueryConfigurations) {
        const tablesQueryConfigTables =
          agentTablesConfigurationTables[tablesQueryConfig.id] ?? [];
        actions.push({
          id: tablesQueryConfig.id,
          sId: tablesQueryConfig.sId,
          type: "tables_query_configuration",
          tables: tablesQueryConfigTables.map((tablesQueryConfigTable) => ({
            dataSourceId: tablesQueryConfigTable.dataSourceId,
            workspaceId: tablesQueryConfigTable.dataSourceWorkspaceId,
            tableId: tablesQueryConfigTable.tableId,
          })),
          name: tablesQueryConfig.name || DEFAULT_TABLES_QUERY_ACTION_NAME,
          description: tablesQueryConfig.description,
        });
      }

      const processConfigurations = processConfigs[agent.id] ?? [];
      for (const processConfig of processConfigurations) {
        const dataSourcesConfig =
          processDatasourceConfigurations[processConfig.id] ?? [];
        actions.push({
          id: processConfig.id,
          sId: processConfig.sId,
          type: "process_configuration",
          dataSources: dataSourcesConfig.map((dsConfig) => {
            return {
              dataSourceId: dsConfig.dataSource.name,
              workspaceId: dsConfig.dataSource.workspace.sId,
              filter: {
                parents:
                  dsConfig.parentsIn && dsConfig.parentsNotIn
                    ? { in: dsConfig.parentsIn, not: dsConfig.parentsNotIn }
                    : null,
              },
            };
          }),
          relativeTimeFrame: renderRetrievalTimeframeType(processConfig),
          tagsFilter:
            processConfig.tagsIn !== null
              ? {
                  in: processConfig.tagsIn,
                }
              : null,
          schema: processConfig.schema,
          name: processConfig.name || DEFAULT_PROCESS_ACTION_NAME,
          description: processConfig.description,
        });
      }
    }

    let template: TemplateResource | null = null;
    if (agent.templateId) {
      template = await TemplateResource.fetchByModelId(agent.templateId);
    }

    const agentConfigurationType: AgentConfigurationType = {
      id: agent.id,
      sId: agent.sId,
      versionCreatedAt: agent.createdAt.toISOString(),
      version: agent.version,
      scope: agent.scope,
      userListStatus: null,
      name: agent.name,
      pictureUrl: agent.pictureUrl,
      description: agent.description,
      instructions: agent.instructions,
      model: {
        providerId: agent.providerId,
        modelId: agent.modelId,
        temperature: agent.temperature,
      },
      status: agent.status,
      actions,
      versionAuthorId: agent.authorId,
      maxStepsPerRun: agent.maxToolsUsePerRun,
      templateId: template?.sId ?? null,
    };

    agentConfigurationType.userListStatus = agentUserListStatus({
      agentConfiguration: agentConfigurationType,
      listStatusOverride:
        agentUserRelations[agent.sId]?.listStatusOverride ?? null,
    });

    agentConfigurationTypes.push(agentConfigurationType);
  }

  if (agentsGetView === "list") {
    agentConfigurationTypes = agentConfigurationTypes.filter((a) => {
      return a.userListStatus === "in-list";
    });
  }

  if (typeof agentsGetView === "object" && "conversationId" in agentsGetView) {
    const mentions = await getConversationMentions(
      agentsGetView.conversationId
    );
    const mentionedAgentIds = mentions.map((m) => m.configurationId);
    agentConfigurationTypes = agentConfigurationTypes.filter((a) => {
      if (mentionedAgentIds.includes(a.sId)) {
        return true;
      }
      return a.userListStatus === "in-list";
    });
  }

  return agentConfigurationTypes;
}

export async function getAgentConfigurations<V extends "light" | "full">({
  auth,
  agentsGetView,
  agentPrefix,
  variant,
  limit,
  sort,
}: {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  variant: V;
  limit?: number;
  sort?: SortStrategyType;
}): Promise<
  V extends "light" ? LightAgentConfigurationType[] : AgentConfigurationType[]
> {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  const user = auth.user();

  if (
    agentsGetView === "admin_internal" &&
    !auth.isDustSuperUser() &&
    !auth.isAdmin()
  ) {
    throw new Error(
      "Superuser view is for dust superusers or internal admin auths only."
    );
  }

  if (agentsGetView === "archived" && !auth.isDustSuperUser()) {
    throw new Error("Archived view is for dust superusers only.");
  }

  if (agentsGetView === "list" && !user) {
    throw new Error("List view is specific to a user.");
  }

  const applySortAndLimit = makeApplySortAndLimit(sort, limit);

  if (agentsGetView === "global") {
    const allGlobalAgents = await fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
    });

    return applySortAndLimit(allGlobalAgents);
  }

  const allAgentConfigurations = await Promise.all([
    fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
    }),
    fetchWorkspaceAgentConfigurationsForView(auth, owner, {
      agentPrefix,
      agentsGetView,
      limit,
      sort,
      variant,
    }),
  ]);

  return applySortAndLimit(allAgentConfigurations.flat());
}

async function getConversationMentions(
  conversationId: string
): Promise<AgentMention[]> {
  const mentions = await Mention.findAll({
    attributes: ["agentConfigurationId"],
    where: {
      agentConfigurationId: {
        [Op.ne]: null,
      },
    },
    include: [
      {
        model: Message,
        attributes: [],
        include: [
          {
            model: Conversation,
            as: "conversation",
            attributes: [],
            where: { sId: conversationId },
            required: true,
          },
        ],
        required: true,
      },
    ],
  });
  return mentions.map((m) => ({
    configurationId: m.agentConfigurationId as string,
  }));
}

/**
 *  Return names of all agents in the workspace, to avoid name collisions.
 */
export async function getAgentNames(auth: Authenticator): Promise<string[]> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  if (!auth.isUser()) {
    throw new Error("Unexpected `auth` from outside workspace.");
  }

  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: owner.id,
      status: "active",
    },
    attributes: ["name"],
  });

  return agents.map((a) => a.name);
}

async function isSelfHostedImageWithValidContentType(pictureUrl: string) {
  // Accept static Dust avatars.
  if (pictureUrl.startsWith("https://dust.tt/static/")) {
    return true;
  }

  const filename = pictureUrl.split("/").at(-1);
  if (!filename) {
    return false;
  }

  // Attempt to decode the URL, since Google Cloud Storage URL encodes the filename.
  const contentType = await getPublicUploadBucket().getFileContentType(
    decodeURIComponent(filename)
  );
  if (!contentType) {
    return false;
  }

  return contentType.includes("image");
}

export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    instructions,
    maxStepsPerRun,
    pictureUrl,
    status,
    scope,
    model,
    agentConfigurationId,
    templateId,
  }: {
    name: string;
    description: string;
    instructions: string | null;
    maxStepsPerRun: number;
    pictureUrl: string;
    status: AgentStatus;
    scope: Exclude<AgentConfigurationScope, "global">;
    model: AgentModelConfigurationType;
    agentConfigurationId?: string;
    templateId: string | null;
  }
): Promise<Result<LightAgentConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const user = auth.user();
  if (!user) {
    throw new Error("Unexpected `auth` without `user`.");
  }

  if (maxStepsPerRun < 0 || maxStepsPerRun > MAX_STEPS_USE_PER_RUN_LIMIT) {
    return new Err(new Error("maxStepsPerRun must be between 0 and 8."));
  }

  const isValidPictureUrl =
    await isSelfHostedImageWithValidContentType(pictureUrl);
  if (!isValidPictureUrl) {
    return new Err(new Error("Invalid picture url."));
  }

  let version = 0;
  let listStatusOverride: AgentUserListStatus | null = null;

  try {
    let template: TemplateResource | null = null;
    if (templateId) {
      template = await TemplateResource.fetchByExternalId(templateId);
    }
    const agent = await frontSequelize.transaction(
      async (t): Promise<AgentConfiguration> => {
        if (agentConfigurationId) {
          const [existing, userRelation] = await Promise.all([
            AgentConfiguration.findOne({
              where: {
                sId: agentConfigurationId,
                workspaceId: owner.id,
              },
              attributes: ["scope", "version"],
              order: [["version", "DESC"]],
              transaction: t,
              limit: 1,
            }),
            AgentUserRelation.findOne({
              where: {
                workspaceId: owner.id,
                agentConfiguration: agentConfigurationId,
                userId: user.id,
              },
              transaction: t,
            }),
          ]);

          if (existing) {
            // Bump the version of the agent.
            version = existing.version + 1;

            // If the agent already exists, record the listStatusOverride to properly render the new
            // AgentConfigurationType.
            if (userRelation) {
              listStatusOverride = userRelation.listStatusOverride;
            }
          }

          await AgentConfiguration.update(
            { status: "archived" },
            {
              where: {
                sId: agentConfigurationId,
                workspaceId: owner.id,
              },
              transaction: t,
            }
          );
        }
        const sId = agentConfigurationId || generateLegacyModelSId();

        // If creating a new agent, we include it in the user's list by default.
        // This is so it doesn't disappear from their list on scope change
        if (!agentConfigurationId) {
          listStatusOverride = "in-list";
          await AgentUserRelation.create(
            {
              workspaceId: owner.id,
              agentConfiguration: sId,
              userId: user.id,
              listStatusOverride: "in-list",
            },
            { transaction: t }
          );
        }
        // Create Agent config.
        return AgentConfiguration.create(
          {
            sId,
            version,
            status,
            scope,
            name,
            description,
            instructions,
            providerId: model.providerId,
            modelId: model.modelId,
            temperature: model.temperature,
            maxToolsUsePerRun: maxStepsPerRun,
            maxStepsPerRun,
            pictureUrl,
            workspaceId: owner.id,
            authorId: user.id,
            templateId: template?.id,
          },
          {
            transaction: t,
          }
        );
      }
    );

    /*
     * Final rendering.
     */
    const agentConfiguration: LightAgentConfigurationType = {
      id: agent.id,
      sId: agent.sId,
      versionCreatedAt: agent.createdAt.toISOString(),
      version: agent.version,
      versionAuthorId: agent.authorId,
      scope: agent.scope,
      userListStatus: null,
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      model: {
        providerId: agent.providerId,
        modelId: agent.modelId,
        temperature: agent.temperature,
      },
      pictureUrl: agent.pictureUrl,
      status: agent.status,
      maxStepsPerRun: agent.maxToolsUsePerRun,
      templateId: template?.sId ?? null,
    };

    agentConfiguration.userListStatus = agentUserListStatus({
      agentConfiguration,
      listStatusOverride,
    });

    await agentConfigurationWasUpdatedBy({
      agent: agentConfiguration,
      auth,
    });

    return new Ok(agentConfiguration);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return new Err(new Error("An agent with this name already exists."));
    }
    throw error;
  }
}

export async function archiveAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const updated = await AgentConfiguration.update(
    { status: "archived" },
    {
      where: {
        sId: agentConfigurationId,
        workspaceId: owner.id,
      },
    }
  );

  const affectedCount = updated[0];
  return affectedCount > 0;
}

export async function restoreAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const latestConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentConfigurationId,
      workspaceId: owner.id,
    },
    order: [["version", "DESC"]],
    limit: 1,
  });
  if (!latestConfig) {
    throw new Error("Could not find agent configuration");
  }
  if (latestConfig.status !== "archived") {
    throw new Error("Agent configuration is not archived");
  }
  const updated = await AgentConfiguration.update(
    { status: "active" },
    {
      where: {
        id: latestConfig.id,
      },
    }
  );

  const affectedCount = updated[0];
  return affectedCount > 0;
}

/**
 * Create Agent RetrievalConfiguration
 */
export async function createAgentActionConfiguration(
  auth: Authenticator,
  action: (
    | {
        type: "retrieval_configuration";
        query: RetrievalQuery;
        relativeTimeFrame: RetrievalTimeframe;
        topK: number | "auto";
        dataSources: DataSourceConfiguration[];
      }
    | {
        type: "dust_app_run_configuration";
        appWorkspaceId: string;
        appId: string;
        app: AppType;
      }
    | {
        type: "tables_query_configuration";
        tables: Array<{
          workspaceId: string;
          dataSourceId: string;
          tableId: string;
        }>;
      }
    | {
        type: "process_configuration";
        relativeTimeFrame: RetrievalTimeframe;
        tagsFilter: ProcessTagsFilter | null;
        dataSources: DataSourceConfiguration[];
        schema: ProcessSchemaPropertyType[];
      }
    | {
        type: "websearch_configuration";
      }
    | {
        type: "browse_configuration";
      }
    | {
        type: "visualization_configuration";
      }
  ) & {
    name: string | null;
    description: string | null;
  },
  agentConfiguration: LightAgentConfigurationType
): Promise<Result<AgentActionConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  switch (action.type) {
    case "retrieval_configuration": {
      return frontSequelize.transaction(async (t) => {
        const retrievalConfig = await AgentRetrievalConfiguration.create(
          {
            sId: generateLegacyModelSId(),
            query: action.query,
            relativeTimeFrame: isTimeFrame(action.relativeTimeFrame)
              ? "custom"
              : action.relativeTimeFrame,
            relativeTimeFrameDuration: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.duration
              : null,
            relativeTimeFrameUnit: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.unit
              : null,
            topK: action.topK !== "auto" ? action.topK : null,
            topKMode: action.topK === "auto" ? "auto" : "custom",
            agentConfigurationId: agentConfiguration.id,
            name: action.name,
            description: action.description,
          },
          { transaction: t }
        );
        await _createAgentDataSourcesConfigData(t, {
          dataSourceConfigurations: action.dataSources,
          retrievalConfigurationId: retrievalConfig.id,
          processConfigurationId: null,
        });

        return new Ok({
          id: retrievalConfig.id,
          sId: retrievalConfig.sId,
          type: "retrieval_configuration",
          query: action.query,
          relativeTimeFrame: action.relativeTimeFrame,
          topK: action.topK,
          dataSources: action.dataSources,
          name: action.name || DEFAULT_RETRIEVAL_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "dust_app_run_configuration": {
      const dustAppRunConfig = await AgentDustAppRunConfiguration.create({
        sId: generateLegacyModelSId(),
        appWorkspaceId: action.appWorkspaceId,
        appId: action.appId,
        agentConfigurationId: agentConfiguration.id,
      });

      return new Ok({
        id: dustAppRunConfig.id,
        sId: dustAppRunConfig.sId,
        type: "dust_app_run_configuration",
        appWorkspaceId: action.appWorkspaceId,
        appId: action.appId,
        name: action.app.name,
        description: action.app.description,
      });
    }
    case "tables_query_configuration": {
      return frontSequelize.transaction(async (t) => {
        const tablesQueryConfig = await AgentTablesQueryConfiguration.create(
          {
            sId: generateLegacyModelSId(),
            agentConfigurationId: agentConfiguration.id,
            name: action.name,
            description: action.description,
          },
          { transaction: t }
        );
        await Promise.all(
          action.tables.map((table) =>
            AgentTablesQueryConfigurationTable.create(
              {
                tablesQueryConfigurationId: tablesQueryConfig.id,
                dataSourceId: table.dataSourceId,
                dataSourceWorkspaceId: table.workspaceId,
                tableId: table.tableId,
              },
              { transaction: t }
            )
          )
        );

        return new Ok({
          id: tablesQueryConfig.id,
          sId: tablesQueryConfig.sId,
          type: "tables_query_configuration",
          tables: action.tables,
          name: action.name || DEFAULT_TABLES_QUERY_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "process_configuration": {
      return frontSequelize.transaction(async (t) => {
        const processConfig = await AgentProcessConfiguration.create(
          {
            sId: generateLegacyModelSId(),
            relativeTimeFrame: isTimeFrame(action.relativeTimeFrame)
              ? "custom"
              : action.relativeTimeFrame,
            relativeTimeFrameDuration: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.duration
              : null,
            relativeTimeFrameUnit: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.unit
              : null,
            tagsIn: action.tagsFilter?.in ?? null,
            agentConfigurationId: agentConfiguration.id,
            schema: action.schema,
            name: action.name,
            description: action.description,
          },
          { transaction: t }
        );
        await _createAgentDataSourcesConfigData(t, {
          dataSourceConfigurations: action.dataSources,
          retrievalConfigurationId: null,
          processConfigurationId: processConfig.id,
        });

        return new Ok({
          id: processConfig.id,
          sId: processConfig.sId,
          type: "process_configuration",
          relativeTimeFrame: action.relativeTimeFrame,
          tagsFilter: action.tagsFilter,
          schema: action.schema,
          dataSources: action.dataSources,
          name: action.name || DEFAULT_PROCESS_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "websearch_configuration": {
      const websearchConfig = await AgentWebsearchConfiguration.create({
        sId: generateLegacyModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
      });

      return new Ok({
        id: websearchConfig.id,
        sId: websearchConfig.sId,
        type: "websearch_configuration",
        name: action.name || DEFAULT_WEBSEARCH_ACTION_NAME,
        description: action.description,
      });
    }
    case "browse_configuration": {
      const browseConfig = await AgentBrowseConfiguration.create({
        sId: generateLegacyModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
      });

      return new Ok({
        id: browseConfig.id,
        sId: browseConfig.sId,
        type: "browse_configuration",
        name: action.name || DEFAULT_BROWSE_ACTION_NAME,
        description: action.description,
      });
    }
    case "visualization_configuration": {
      const visualizationConfig = await AgentVisualizationConfiguration.create({
        sId: generateLegacyModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
      });

      return new Ok({
        id: visualizationConfig.id,
        sId: visualizationConfig.sId,
        type: "visualization_configuration",
        name: action.name || DEFAULT_VISUALIZATION_ACTION_NAME,
        description: action.description,
      });
    }
    default:
      assertNever(action);
  }
}

function renderRetrievalTimeframeType(
  action: AgentRetrievalConfiguration | AgentProcessConfiguration
) {
  let timeframe: RetrievalTimeframe = "auto";
  if (
    action.relativeTimeFrame === "custom" &&
    action.relativeTimeFrameDuration &&
    action.relativeTimeFrameUnit
  ) {
    timeframe = {
      duration: action.relativeTimeFrameDuration,
      unit: action.relativeTimeFrameUnit,
    };
  } else if (action.relativeTimeFrame === "none") {
    timeframe = "none";
  }
  return timeframe;
}

/**
 * Create the AgentDataSourceConfiguration rows in database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obvisously need to do as few queries as possible.
 */
async function _createAgentDataSourcesConfigData(
  t: Transaction,
  {
    dataSourceConfigurations,
    retrievalConfigurationId,
    processConfigurationId,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
    retrievalConfigurationId: ModelId | null;
    processConfigurationId: ModelId | null;
  }
): Promise<AgentDataSourceConfiguration[]> {
  // dsConfig contains this format:
  // [
  //   { workspaceSId: s1o1u1p, dataSourceName: "managed-notion", filter: { tags: null, parents: null } },
  //   { workspaceSId: s1o1u1p, dataSourceName: "managed-slack", filter: { tags: null, parents: null } },
  //   { workspaceSId: i2n2o2u, dataSourceName: "managed-notion", filter: { tags: null, parents: null } },
  // ]

  // First we get the list of workspaces because we need the mapping between workspaceSId and workspaceId
  const workspaces = await Workspace.findAll({
    where: {
      sId: dataSourceConfigurations.map((dsConfig) => dsConfig.workspaceId),
    },
    attributes: ["id", "sId"],
    transaction: t,
  });

  // Now will want to group the datasource names by workspaceId to do only one query per workspace.
  // We want this:
  // [
  //   { workspaceId: 1, dataSourceNames: ["managed-notion", "managed-slack"] },
  //   { workspaceId: 2, dataSourceNames: ["managed-notion"] }
  // ]
  type _DsNamesPerWorkspaceIdType = {
    workspaceId: number;
    dataSourceNames: string[];
  };
  const dsNamesPerWorkspaceId = dataSourceConfigurations.reduce(
    (acc: _DsNamesPerWorkspaceIdType[], curr: DataSourceConfiguration) => {
      // First we need to get the workspaceId from the workspaceSId
      const workspace = workspaces.find((w) => w.sId === curr.workspaceId);
      if (!workspace) {
        throw new Error(
          "Can't create Datasources config for retrieval: Workspace not found"
        );
      }

      // Find an existing entry for this workspaceId
      const existingEntry: _DsNamesPerWorkspaceIdType | undefined = acc.find(
        (entry: _DsNamesPerWorkspaceIdType) =>
          entry.workspaceId === workspace.id
      );
      if (existingEntry) {
        // Append dataSourceName to existing entry
        existingEntry.dataSourceNames.push(curr.dataSourceId);
      } else {
        // Add a new entry for this workspaceId
        acc.push({
          workspaceId: workspace.id,
          dataSourceNames: [curr.dataSourceId],
        });
      }
      return acc;
    },
    []
  );

  // Then we get do one findAllQuery per workspaceId, in a Promise.all
  const getDataSourcesQueries = dsNamesPerWorkspaceId.map(
    ({ workspaceId, dataSourceNames }) => {
      return DataSource.findAll({
        where: {
          workspaceId,
          name: {
            [Op.in]: dataSourceNames,
          },
        },
        transaction: t,
      });
    }
  );
  const results = await Promise.all(getDataSourcesQueries);
  const dataSources = results.flat();

  const agentDataSourcesConfigRows: AgentDataSourceConfiguration[] =
    await Promise.all(
      dataSourceConfigurations.map(async (dsConfig) => {
        const dataSource = dataSources.find(
          (ds) =>
            ds.name === dsConfig.dataSourceId &&
            ds.workspaceId ===
              workspaces.find((w) => w.sId === dsConfig.workspaceId)?.id
        );
        if (!dataSource) {
          throw new Error(
            `Can't create AgentDataSourcesConfig: datasource not found. dataSourceId: ${dsConfig.dataSourceId}`
          );
        }
        return AgentDataSourceConfiguration.create(
          {
            dataSourceId: dataSource.id,
            parentsIn: dsConfig.filter.parents?.in,
            parentsNotIn: dsConfig.filter.parents?.not,
            retrievalConfigurationId: retrievalConfigurationId,
            processConfigurationId: processConfigurationId,
          },
          { transaction: t }
        );
      })
    );

  return agentDataSourcesConfigRows;
}

export async function agentNameIsAvailable(
  auth: Authenticator,
  nameToCheck: string
) {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const agent = await AgentConfiguration.findOne({
    where: {
      workspaceId: owner.id,
      name: nameToCheck,
      status: "active",
    },
  });

  return !agent;
}

export async function setAgentScope(
  auth: Authenticator,
  agentId: string,
  scope: AgentConfigurationScope
): Promise<Result<{ agentId: string; scope: AgentConfigurationScope }, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (scope === "global") {
    return new Err(new Error("Cannot set scope to global"));
  }

  const agent = await AgentConfiguration.findOne({
    where: {
      workspaceId: owner.id,
      sId: agentId,
      status: "active",
    },
  });

  if (!agent) {
    return new Err(new Error(`Could not find agent ${agentId}`));
  }

  if (agent.scope === scope) {
    return new Ok({ agentId, scope });
  }

  agent.scope = scope;
  await agent.save();

  return new Ok({ agentId, scope });
}

// Should only be called when we need to cleanup the agent configuration
// right after creating it due to an error.
export async function unsafeHardDeleteAgentConfiguration(
  agentConfiguration: LightAgentConfigurationType
): Promise<void> {
  await AgentConfiguration.destroy({
    where: {
      id: agentConfiguration.id,
    },
  });
}
