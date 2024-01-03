import {
  AgentMention,
  AgentUserListStatus,
  Err,
  Ok,
  Result,
  SupportedModel,
} from "@dust-tt/types";
import { DustAppRunConfigurationType } from "@dust-tt/types";
import {
  AgentsGetViewType,
  DataSourceConfiguration,
  isTemplatedQuery,
  isTimeFrame,
  RetrievalConfigurationType,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@dust-tt/types";
import {
  AgentActionConfigurationType,
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
  AgentStatus,
} from "@dust-tt/types";
import { isSupportedModel } from "@dust-tt/types";
import { DatabaseQueryConfigurationType } from "@dust-tt/types";
import { FindOptions, Op, Transaction, UniqueConstraintError } from "sequelize";

import {
  getGlobalAgent,
  getGlobalAgents,
  isGlobalAgentId,
} from "@app/lib/api/assistant/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import { agentUserListStatus } from "@app/lib/api/assistant/user_relation";
import { Authenticator } from "@app/lib/auth";
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
  agentId: string,
  preFetchedAgentConfiguration?: AgentConfiguration,
  preFetchedUserRelation?: AgentUserRelation | null,
  preFetchedDataSourceConfigurations?: AgentDataSourceConfiguration[]
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  if (isGlobalAgentId(agentId)) {
    return await getGlobalAgent(auth, agentId, null);
  }

  const user = auth.user();

  const [agent, userRelation] = await Promise.all([
    (async () => {
      const agent =
        preFetchedAgentConfiguration ??
        (await AgentConfiguration.findOne({
          where: {
            sId: agentId,
            workspaceId: owner.id,
          },
          order: [["version", "DESC"]],
          include: [
            {
              model: AgentGenerationConfiguration,
              as: "generationConfiguration",
            },
            {
              model: AgentRetrievalConfiguration,
              as: "retrievalConfiguration",
            },
            {
              model: AgentDustAppRunConfiguration,
              as: "dustAppRunConfiguration",
            },
            {
              model: AgentDatabaseQueryConfiguration,
              as: "databaseQueryConfiguration",
            },
          ],
          limit: 1,
        }));

      return agent;
    })(),
    (async () => {
      if (!user) {
        return null;
      }
      if (preFetchedUserRelation !== undefined) {
        return preFetchedUserRelation;
      }
      return AgentUserRelation.findOne({
        where: {
          workspaceId: owner.id,
          agentConfiguration: agentId,
          userId: user.id,
        },
      });
    })(),
  ]);

  if (!agent) {
    return null;
  }

  let action:
    | RetrievalConfigurationType
    | DustAppRunConfigurationType
    | DatabaseQueryConfigurationType
    | null = null;

  /*
   * Retrieval configuration.
   */
  if (agent.retrievalConfigurationId) {
    const dataSourcesConfig =
      preFetchedDataSourceConfigurations !== undefined
        ? preFetchedDataSourceConfigurations
        : await AgentDataSourceConfiguration.findAll({
            where: {
              retrievalConfigurationId: agent.retrievalConfiguration?.id,
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
          });

    const retrievalConfig = agent.retrievalConfiguration;

    if (!retrievalConfig) {
      throw new Error(
        `Couldn't find action configuration for retrieval configuration ${agent.retrievalConfigurationId}}`
      );
    }

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
        return {
          dataSourceId: dsConfig.dataSource.name,
          workspaceId: dsConfig.dataSource.workspace.sId,
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
  }

  /*
   * DustAppRun configuration.
   */
  if (agent.dustAppRunConfigurationId) {
    const dustAppRunConfig = agent.dustAppRunConfiguration;

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
  }

  /*
   * DatabaseQuery configuration.
   */
  if (agent.databaseQueryConfigurationId) {
    const databaseQueryConfig = agent.databaseQueryConfiguration;
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

  /*
   * Generation configuraiton.
   */
  const generationConfig = agent.generationConfiguration;
  let generation: AgentGenerationConfigurationType | null = null;

  if (generationConfig) {
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

  /*
   * Final rendering.
   */
  const agentConfiguration: AgentConfigurationType = {
    id: agent.id,
    sId: agent.sId,
    version: agent.version,
    scope: agent.scope,
    userListStatus: null,
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    description: agent.description,
    status: agent.status,
    action: action,
    generation,
    versionAuthorId: agent.authorId,
  };

  agentConfiguration.userListStatus = agentUserListStatus({
    agentConfiguration,
    listStatusOverride: userRelation?.listStatusOverride || null,
  });

  return agentConfiguration;
}

/**
 * Get agent configurations for the workspace, optionally whose names
 * match a prefix
 * @param agentsGetView the kind of list of agents we want to get, see AgentsGetViewType
 */
export async function getAgentConfigurations(
  auth: Authenticator,
  agentsGetView: AgentsGetViewType,
  agentPrefix?: string
): Promise<AgentConfigurationType[] | []> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  if (!auth.isUser()) {
    throw new Error("Unexpected `auth` from outside workspace.");
  }

  const user = auth.user();

  const baseAgentsSequelizeQuery = {
    where: {
      workspaceId: owner.id,
      status: "active",
      ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
    },
    include: [
      {
        model: AgentGenerationConfiguration,
        as: "generationConfiguration",
      },
      {
        model: AgentRetrievalConfiguration,
        as: "retrievalConfiguration",
      },
      {
        model: AgentDustAppRunConfiguration,
        as: "dustAppRunConfiguration",
      },
      {
        model: AgentDatabaseQueryConfiguration,
        as: "databaseQueryConfiguration",
      },
    ],
  };

  const getGlobalAgentConfigurations = async ({
    activeOnly,
  }: {
    activeOnly: boolean;
  }) =>
    (await getGlobalAgents(auth)).filter(
      (a) =>
        (!activeOnly || a.status === "active") &&
        (!agentPrefix ||
          a.name.toLowerCase().startsWith(agentPrefix.toLowerCase()))
    );

  const getAgentConfigurationsForQuery = async (
    agentsSequelizeQuery: FindOptions
  ) => {
    const agents = await AgentConfiguration.findAll(agentsSequelizeQuery);

    const retrievalConfigurationIds = agents
      .map((a) => a.retrievalConfigurationId)
      .flatMap((id) => (id ? [id] : []));

    const [dataSourcesConfigurations, userRelations] = await Promise.all([
      AgentDataSourceConfiguration.findAll({
        where: {
          retrievalConfigurationId: { [Op.in]: retrievalConfigurationIds },
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
      }),
      (async () => {
        if (!user) {
          return [];
        }
        return await AgentUserRelation.findAll({
          where: {
            workspaceId: owner.id,
            userId: user?.id,
            agentConfiguration: { [Op.in]: agents.map((a) => a.sId) },
          },
        });
      })(),
    ]);

    return (
      await Promise.all(
        agents.map((a) =>
          getAgentConfiguration(
            auth,
            a.sId,
            a,
            // Make sure to pass null so that it is not fetched again.
            userRelations.find((r) => r.agentConfiguration === a.sId) || null,
            dataSourcesConfigurations.filter(
              (dsc) =>
                dsc.retrievalConfigurationId === a.retrievalConfigurationId
            )
          )
        )
      )
    ).filter((a) => a !== null) as AgentConfigurationType[];
  };

  // Superuser view (all agents, to be used internally from poke).
  if (agentsGetView === "admin_internal") {
    if (!auth.isDustSuperUser() && !auth.isAdmin()) {
      throw new Error(
        "superuser view is for dust superusers or internal admin auths only."
      );
    }
    return (
      await Promise.all([
        getAgentConfigurationsForQuery(baseAgentsSequelizeQuery),
        getGlobalAgentConfigurations({ activeOnly: true }),
      ])
    ).flat();
  }

  // All view (published + workspace agents + globals).
  if (agentsGetView === "all") {
    const allAgentsSequelizeQuery = {
      ...baseAgentsSequelizeQuery,
      where: {
        ...baseAgentsSequelizeQuery.where,
        scope: { [Op.in]: ["published", "workspace"] },
      },
    };
    return (
      await Promise.all([
        getAgentConfigurationsForQuery(allAgentsSequelizeQuery),
        getGlobalAgentConfigurations({ activeOnly: true }),
      ])
    ).flat();
  }

  // Workspace view (only workspace agents).
  if (agentsGetView === "workspace") {
    const workspaceAgentsSequelizeQuery = {
      ...baseAgentsSequelizeQuery,
      where: {
        ...baseAgentsSequelizeQuery.where,
        scope: { [Op.in]: ["workspace"] },
      },
    };
    return (
      await Promise.all([
        getAgentConfigurationsForQuery(workspaceAgentsSequelizeQuery),
        [],
      ])
    ).flat();
  }

  // Published view (only published agents).
  if (agentsGetView === "published") {
    const publishedAgentsSequelizeQuery = {
      ...baseAgentsSequelizeQuery,
      where: {
        ...baseAgentsSequelizeQuery.where,
        scope: { [Op.in]: ["published"] },
      },
    };
    return (
      await Promise.all([
        getAgentConfigurationsForQuery(publishedAgentsSequelizeQuery),
        [],
      ])
    ).flat();
  }

  if (agentsGetView === "global") {
    return (
      await Promise.all([
        [],
        getGlobalAgentConfigurations({ activeOnly: false }),
      ])
    ).flat();
  }

  // List view (user agents list).
  if (agentsGetView === "list") {
    const user = auth.user();
    if (!user) {
      throw new Error("List view is specific to a user.");
    }

    const listAgentsSequelizeQuery = {
      ...baseAgentsSequelizeQuery,
      where: {
        ...baseAgentsSequelizeQuery.where,
        [Op.or]: [
          { scope: { [Op.in]: ["published", "workspace"] } },
          { authorId: user.id },
        ],
      },
    };

    const listAgentsPromise = getAgentConfigurationsForQuery(
      listAgentsSequelizeQuery
    ).then(
      (agents) =>
        agents.filter((a) => {
          return a.userListStatus === "in-list";
        }) as AgentConfigurationType[]
    );

    return (
      await Promise.all([
        listAgentsPromise,
        getGlobalAgentConfigurations({ activeOnly: true }),
      ])
    ).flat();
  }

  // Conversation view (user agents list + agents mentioned in the conversation).
  if (typeof agentsGetView === "object" && agentsGetView.conversationId) {
    const user = auth.user();
    if (!user) {
      throw new Error("Conversation view is specific to a user.");
    }
    const conversationAgentsSequelizeQuery = {
      ...baseAgentsSequelizeQuery,
      where: {
        ...baseAgentsSequelizeQuery.where,
        [Op.or]: [
          { scope: { [Op.in]: ["published", "workspace"] } },
          { authorId: user.id },
        ],
      },
    };
    const [agents, mentions, globalAgents] = await Promise.all([
      getAgentConfigurationsForQuery(conversationAgentsSequelizeQuery),
      getConversationMentions(agentsGetView.conversationId),
      getGlobalAgentConfigurations({ activeOnly: true }),
    ]);
    const mentionedAgentIds = mentions.map((m) => m.configurationId);
    const localAgents = agents.filter((a) => {
      if (mentionedAgentIds.includes(a.sId)) {
        return true;
      }
      return a.userListStatus === "in-list";
    }) as AgentConfigurationType[];
    return [...localAgents, ...globalAgents];
  }

  throw new Error(`Unknown agentsGetView ${agentsGetView}`);
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
    return await front_sequelize.transaction(async (t) => {
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
