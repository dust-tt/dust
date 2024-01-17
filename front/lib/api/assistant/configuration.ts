import type {
  AgentMention,
  AgentUserListStatus,
  LightAgentConfigurationType,
  Result,
  SupportedModel,
} from "@dust-tt/types";
import type { DustAppRunConfigurationType } from "@dust-tt/types";
import type {
  AgentsGetViewType,
  DataSourceConfiguration,
  RetrievalConfigurationType,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@dust-tt/types";
import type {
  AgentActionConfigurationType,
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
  AgentStatus,
} from "@dust-tt/types";
import type { DatabaseQueryConfigurationType } from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import { isTemplatedQuery, isTimeFrame } from "@dust-tt/types";
import { isSupportedModel } from "@dust-tt/types";
import type { Transaction } from "sequelize";
import { Op, UniqueConstraintError } from "sequelize";

import {
  getGlobalAgents,
  isGlobalAgentId,
} from "@app/lib/api/assistant/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import { agentUserListStatus } from "@app/lib/api/assistant/user_relation";
import type { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentDatabaseQueryConfiguration,
  AgentDataSourceConfiguration,
  AgentDustAppRunConfiguration,
  AgentGenerationConfiguration,
  AgentRetrievalConfiguration,
  Conversation,
  DataSource,
  Mention,
  Message,
  Workspace,
} from "@app/lib/models";
import { AgentUserRelation } from "@app/lib/models/assistant/agent";
import { generateModelSId } from "@app/lib/utils";

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

export async function getAgentConfigurations<V extends "light" | "full">({
  auth,
  agentsGetView,
  agentPrefix,
  variant,
}: {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  variant: V;
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
      "superuser view is for dust superusers or internal admin auths only."
    );
  }
  if (agentsGetView === "list" && !user) {
    throw new Error("List view is specific to a user.");
  }

  const globalAgentsIds =
    typeof agentsGetView === "object" && "agentId" in agentsGetView
      ? [agentsGetView.agentId].filter((id) => isGlobalAgentId(id))
      : undefined;

  let globalAgentsPromise = getGlobalAgents(auth, globalAgentsIds).then(
    (globals) =>
      globals.filter(
        (a) =>
          !agentPrefix ||
          a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
      )
  );

  if (agentsGetView === "global") {
    return globalAgentsPromise;
  }

  globalAgentsPromise = globalAgentsPromise.then((globals) =>
    globals.filter((a) => a.status === "active")
  );

  const baseAgentsSequelizeQuery = {
    where: {
      workspaceId: owner.id,
      status: "active",
      ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
    },
  };

  const agentConfigurations: AgentConfiguration[] = await (() => {
    switch (agentsGetView) {
      case "admin_internal":
        return AgentConfiguration.findAll({
          ...baseAgentsSequelizeQuery,
        });
      case "all":
        return AgentConfiguration.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseAgentsSequelizeQuery.where,
            scope: { [Op.in]: ["workspace", "published"] },
          },
        });
      case "workspace":
        return AgentConfiguration.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseAgentsSequelizeQuery.where,
            scope: { [Op.in]: ["workspace"] },
          },
        });
      case "published":
        return AgentConfiguration.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseAgentsSequelizeQuery.where,
            scope: { [Op.in]: ["published"] },
          },
        });
      case "list":
        return AgentConfiguration.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseAgentsSequelizeQuery.where,
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
              ...(agentPrefix
                ? { name: { [Op.iLike]: `${agentPrefix}%` } }
                : {}),
              sId: agentsGetView.agentId,
            },
            order: [["version", "DESC"]],
            ...(agentsGetView.allVersions ? {} : { limit: 1 }),
          });
        }
        if (
          typeof agentsGetView === "object" &&
          "conversationId" in agentsGetView
        ) {
          return AgentConfiguration.findAll({
            ...baseAgentsSequelizeQuery,
            where: {
              ...baseAgentsSequelizeQuery.where,
              [Op.or]: [
                { scope: { [Op.in]: ["workspace", "published"] } },
                { authorId: user?.id },
              ],
            },
          });
        }
        assertNever(agentsGetView);
    }
  })();

  function byId<T extends { id: number }>(list: T[]): Record<string, T> {
    return list.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as Record<number, T>);
  }

  const configurationIds = agentConfigurations.map((a) => a.id);
  const configurationSIds = agentConfigurations.map((a) => a.sId);
  const generationConfigIds = agentConfigurations
    .filter((a) => a.generationConfigurationId !== null)
    .map((a) => a.generationConfigurationId as number);
  const retrievalConfigIds = agentConfigurations
    .filter((a) => a.retrievalConfigurationId !== null)
    .map((a) => a.retrievalConfigurationId as number);
  const dustAppRunConfigIds = agentConfigurations
    .filter((a) => a.dustAppRunConfigurationId !== null)
    .map((a) => a.dustAppRunConfigurationId as number);
  const databaseQueryConfigIds = agentConfigurations
    .filter((a) => a.databaseQueryConfigurationId !== null)
    .map((a) => a.databaseQueryConfigurationId as number);

  const [
    generationConfigs,
    retrievalConfigs,
    dustAppRunConfigs,
    databaseQueryConfigs,
    agentUserRelations,
  ] = await Promise.all([
    generationConfigIds.length > 0
      ? AgentGenerationConfiguration.findAll({
          where: { id: { [Op.in]: generationConfigIds } },
        }).then(byId)
      : Promise.resolve({} as Record<number, AgentGenerationConfiguration>),
    retrievalConfigIds.length > 0 && variant === "full"
      ? AgentRetrievalConfiguration.findAll({
          where: { id: { [Op.in]: retrievalConfigIds } },
        }).then(byId)
      : Promise.resolve({} as Record<number, AgentRetrievalConfiguration>),
    dustAppRunConfigIds.length > 0 && variant === "full"
      ? AgentDustAppRunConfiguration.findAll({
          where: { id: { [Op.in]: dustAppRunConfigIds } },
        }).then(byId)
      : Promise.resolve({} as Record<number, AgentDustAppRunConfiguration>),
    databaseQueryConfigIds.length > 0 && variant === "full"
      ? AgentDatabaseQueryConfiguration.findAll({
          where: { id: { [Op.in]: databaseQueryConfigIds } },
        }).then(byId)
      : Promise.resolve({} as Record<number, AgentDatabaseQueryConfiguration>),
    user && configurationIds.length > 0
      ? AgentUserRelation.findAll({
          where: {
            agentConfiguration: { [Op.in]: configurationSIds },
            userId: user.id,
          },
        }).then((relations) =>
          relations.reduce((acc, relation) => {
            acc[relation.agentConfiguration] = relation;
            return acc;
          }, {} as Record<string, AgentUserRelation>)
        )
      : Promise.resolve({} as Record<string, AgentUserRelation>),
  ]);

  const agentDatasourceConfigurations = (
    Object.values(retrievalConfigs).length
      ? await AgentDataSourceConfiguration.findAll({
          where: {
            retrievalConfigurationId: {
              [Op.in]: Object.values(retrievalConfigs).map((r) => r.id),
            },
          },
        })
      : []
  ).reduce((acc, dsConfig) => {
    acc[dsConfig.retrievalConfigurationId] =
      acc[dsConfig.retrievalConfigurationId] || [];
    acc[dsConfig.retrievalConfigurationId].push(dsConfig);
    return acc;
  }, {} as Record<number, AgentDataSourceConfiguration[]>);

  const dataSourceIds = Object.values(agentDatasourceConfigurations)
    .flat()
    .map((dsConfig) => dsConfig.dataSourceId);
  const dataSources = (
    dataSourceIds.length
      ? await DataSource.findAll({
          where: {
            id: {
              [Op.in]: dataSourceIds,
            },
          },
        })
      : []
  ).reduce((acc, ds) => {
    acc[ds.id] = ds;
    return acc;
  }, {} as Record<number, DataSource>);

  const workspaceIds = Object.values(dataSources).map((ds) => ds.workspaceId);
  const dataSourceWorkspaces = (
    workspaceIds.length
      ? await Workspace.findAll({
          where: {
            id: {
              [Op.in]: workspaceIds,
            },
          },
        })
      : []
  ).reduce((acc, ws) => {
    acc[ws.id] = ws;
    return acc;
  }, {} as Record<number, Workspace>);

  let agentConfigurationTypes: AgentConfigurationType[] = [];
  for (const agent of agentConfigurations) {
    let action:
      | RetrievalConfigurationType
      | DustAppRunConfigurationType
      | DatabaseQueryConfigurationType
      | null = null;

    if (variant === "full") {
      if (agent.retrievalConfigurationId) {
        const retrievalConfig =
          retrievalConfigs[agent.retrievalConfigurationId];

        if (!retrievalConfig) {
          throw new Error(
            `Couldn't find action configuration for retrieval configuration ${agent.retrievalConfigurationId}}`
          );
        }

        const dataSourcesConfig =
          agentDatasourceConfigurations[retrievalConfig.id] ?? [];
        let topK: number | "auto" = "auto";
        if (retrievalConfig.topKMode === "custom") {
          if (!retrievalConfig.topK) {
            // unreachable
            throw new Error(
              `Couldn't find topK for retrieval configuration ${agent.retrievalConfigurationId}} with 'custom' topK mode`
            );
          }

          topK = retrievalConfig.topK;
        }

        action = {
          id: retrievalConfig.id,
          sId: retrievalConfig.sId,
          type: "retrieval_configuration",
          query: renderRetrievalQueryType(retrievalConfig),
          relativeTimeFrame: renderRetrievalTimeframeType(retrievalConfig),
          topK,
          dataSources: dataSourcesConfig.map((dsConfig) => {
            const dataSource = dataSources[dsConfig.dataSourceId];
            const workspace = dataSourceWorkspaces[dataSource.workspaceId];
            return {
              dataSourceId: dataSource.name,
              workspaceId: workspace.sId,
              filter: {
                tags:
                  dsConfig.tagsIn && dsConfig.tagsNotIn
                    ? { in: dsConfig.tagsIn, not: dsConfig.tagsNotIn }
                    : null,
                parents:
                  dsConfig.parentsIn && dsConfig.parentsNotIn
                    ? { in: dsConfig.parentsIn, not: dsConfig.parentsNotIn }
                    : null,
              },
            };
          }),
        };
      } else if (agent.dustAppRunConfigurationId) {
        const dustAppRunConfig =
          dustAppRunConfigs[agent.dustAppRunConfigurationId];

        if (!dustAppRunConfig) {
          throw new Error(
            `Couldn't find action configuration for DustAppRun configuration ${agent.dustAppRunConfigurationId}}`
          );
        }

        action = {
          id: dustAppRunConfig.id,
          sId: dustAppRunConfig.sId,
          type: "dust_app_run_configuration",
          appWorkspaceId: dustAppRunConfig.appWorkspaceId,
          appId: dustAppRunConfig.appId,
        };
      } else if (agent.databaseQueryConfigurationId) {
        const databaseQueryConfig =
          databaseQueryConfigs[agent.databaseQueryConfigurationId];

        if (!databaseQueryConfig) {
          throw new Error(
            `Couldn't find action configuration for Database configuration ${agent.databaseQueryConfigurationId}}`
          );
        }

        action = {
          id: databaseQueryConfig.id,
          sId: databaseQueryConfig.sId,
          type: "database_query_configuration",
          dataSourceWorkspaceId: databaseQueryConfig.dataSourceWorkspaceId,
          dataSourceId: databaseQueryConfig.dataSourceId,
          databaseId: databaseQueryConfig.databaseId,
        };
      }
    }

    let generation: AgentGenerationConfigurationType | null = null;

    if (agent.generationConfigurationId) {
      const generationConfig =
        generationConfigs[agent.generationConfigurationId];
      const model = {
        providerId: generationConfig.providerId,
        modelId: generationConfig.modelId,
      };
      if (!isSupportedModel(model)) {
        throw new Error(`Unknown model ${model.providerId}/${model.modelId}`);
      }
      generation = {
        id: generationConfig.id,
        prompt: generationConfig.prompt,
        temperature: generationConfig.temperature,
        model,
      };
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
      status: agent.status,
      action,
      generation,
      versionAuthorId: agent.authorId,
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

  return globalAgentsPromise.then((globalAgents) => [
    ...agentConfigurationTypes,
    ...globalAgents,
  ]);
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

/**
 * Create Agent Configuration
 */
export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    pictureUrl,
    status,
    scope,
    generation,
    action,
    agentConfigurationId,
  }: {
    name: string;
    description: string;
    pictureUrl: string;
    status: AgentStatus;
    scope: Exclude<AgentConfigurationScope, "global">;
    generation: AgentGenerationConfigurationType | null;
    action: AgentActionConfigurationType | null;
    agentConfigurationId?: string;
  }
): Promise<Result<AgentConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const user = auth.user();
  if (!user) {
    throw new Error("Unexpected `auth` without `user`.");
  }

  let version = 0;
  let listStatusOverride: AgentUserListStatus | null = null;

  try {
    const agent = await front_sequelize.transaction(
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

            // At time of writing, private agents can only be created from scratch. An existing agent
            // that is not already private cannot be updated back to private.
            if (
              existing &&
              scope === "private" &&
              existing.scope !== "private"
            ) {
              throw new Error("Published agents cannot go back to private.");
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
        const sId = agentConfigurationId || generateModelSId();

        // If creating a new private or published agent, it should be in the user's list, so it
        // appears in their 'assistants' page (at creation for assistants created published, or at
        // publication once a private assistant gets published).
        if (["private", "published"].includes(scope) && !agentConfigurationId) {
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
            pictureUrl,
            workspaceId: owner.id,
            generationConfigurationId: generation?.id || null,
            authorId: user.id,
            // We know here that these are one that we created and not a "global virtual" one so we're
            // good to set the foreign key.
            retrievalConfigurationId:
              action?.type === "retrieval_configuration" ? action?.id : null,
            dustAppRunConfigurationId:
              action?.type === "dust_app_run_configuration" ? action?.id : null,
            databaseQueryConfigurationId:
              action?.type === "database_query_configuration"
                ? action?.id
                : null,
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
    const agentConfiguration: AgentConfigurationType = {
      id: agent.id,
      sId: agent.sId,
      versionCreatedAt: agent.createdAt.toISOString(),
      version: agent.version,
      versionAuthorId: agent.authorId,
      scope: agent.scope,
      userListStatus: null,
      name: agent.name,
      description: agent.description,
      pictureUrl: agent.pictureUrl,
      status: agent.status,
      action: action,
      generation: generation,
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

/**
 * Archive Agent Configuration
 */
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

  return updated[0] > 0;
}

/**
 * Create Agent Generation Configuration
 */
export async function createAgentGenerationConfiguration(
  auth: Authenticator,
  {
    prompt,
    model,
    temperature,
  }: {
    prompt: string;
    model: SupportedModel;
    temperature: number;
  }
): Promise<AgentGenerationConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  if (temperature < 0) {
    throw new Error("Temperature must be positive.");
  }

  const genConfig = await AgentGenerationConfiguration.create({
    prompt: prompt,
    providerId: model.providerId,
    modelId: model.modelId,
    temperature: temperature,
  });

  return {
    id: genConfig.id,
    prompt: genConfig.prompt,
    temperature: genConfig.temperature,
    model,
  };
}

/**
 * Create Agent RetrievalConfiguration
 */
export async function createAgentActionConfiguration(
  auth: Authenticator,
  action:
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
      }
    | {
        type: "database_query_configuration";
        dataSourceWorkspaceId: string;
        dataSourceId: string;
        databaseId: string;
      }
): Promise<AgentActionConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (action.type === "retrieval_configuration") {
    return front_sequelize.transaction(async (t) => {
      const retrievalConfig = await AgentRetrievalConfiguration.create(
        {
          sId: generateModelSId(),
          query: isTemplatedQuery(action.query) ? "templated" : action.query,
          queryTemplate: isTemplatedQuery(action.query)
            ? action.query.template
            : null,
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
        },
        { transaction: t }
      );
      await _createAgentDataSourcesConfigData(
        t,
        action.dataSources,
        retrievalConfig.id
      );

      return {
        id: retrievalConfig.id,
        sId: retrievalConfig.sId,
        type: "retrieval_configuration",
        query: action.query,
        relativeTimeFrame: action.relativeTimeFrame,
        topK: action.topK,
        dataSources: action.dataSources,
      };
    });
  } else if (action.type === "dust_app_run_configuration") {
    const dustAppRunConfig = await AgentDustAppRunConfiguration.create({
      sId: generateModelSId(),
      appWorkspaceId: action.appWorkspaceId,
      appId: action.appId,
    });

    return {
      id: dustAppRunConfig.id,
      sId: dustAppRunConfig.sId,
      type: "dust_app_run_configuration",
      appWorkspaceId: action.appWorkspaceId,
      appId: action.appId,
    };
  } else if (action.type === "database_query_configuration") {
    const databaseQueryConfig = await AgentDatabaseQueryConfiguration.create({
      sId: generateModelSId(),
      dataSourceWorkspaceId: action.dataSourceWorkspaceId,
      dataSourceId: action.dataSourceId,
      databaseId: action.databaseId,
    });
    return {
      id: databaseQueryConfig.id,
      sId: databaseQueryConfig.sId,
      type: "database_query_configuration",
      dataSourceWorkspaceId: action.dataSourceWorkspaceId,
      dataSourceId: action.dataSourceId,
      databaseId: action.databaseId,
    };
  } else {
    throw new Error("Cannot create AgentActionConfiguration: unknow type");
  }
}

function renderRetrievalTimeframeType(action: AgentRetrievalConfiguration) {
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

function renderRetrievalQueryType(action: AgentRetrievalConfiguration) {
  let query: RetrievalQuery = "auto";
  if (action.query === "templated" && action.queryTemplate) {
    query = {
      template: action.queryTemplate,
    };
  } else if (action.query === "none") {
    query = "none";
  }
  return query;
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
  dataSourcesConfig: DataSourceConfiguration[],
  retrievalConfigurationId: number
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
      sId: dataSourcesConfig.map((dsConfig) => dsConfig.workspaceId),
    },
    attributes: ["id", "sId"],
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
  const dsNamesPerWorkspaceId = dataSourcesConfig.reduce(
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
      });
    }
  );
  const results = await Promise.all(getDataSourcesQueries);
  const dataSources = results.flat();

  const agentDataSourcesConfigRows: AgentDataSourceConfiguration[] =
    await Promise.all(
      dataSourcesConfig.map(async (dsConfig) => {
        const dataSource = dataSources.find(
          (ds) =>
            ds.name === dsConfig.dataSourceId &&
            ds.workspaceId ===
              workspaces.find((w) => w.sId === dsConfig.workspaceId)?.id
        );
        if (!dataSource) {
          throw new Error(
            "Can't create AgentDataSourcesConfig: datasource not found."
          );
        }
        return AgentDataSourceConfiguration.create(
          {
            dataSourceId: dataSource.id,
            tagsIn: dsConfig.filter.tags?.in,
            tagsNotIn: dsConfig.filter.tags?.not,
            parentsIn: dsConfig.filter.parents?.in,
            parentsNotIn: dsConfig.filter.parents?.not,
            retrievalConfigurationId: retrievalConfigurationId,
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
