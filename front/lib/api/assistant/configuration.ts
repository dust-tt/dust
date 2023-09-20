import * as t from "io-ts";
import { Op, Transaction } from "sequelize";

import {
  getGlobalAgent,
  getGlobalAgents,
  isGlobalAgentId,
} from "@app/lib/api/assistant/global_agents";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentDataSourceConfiguration,
  AgentGenerationConfiguration,
  AgentRetrievalConfiguration,
  DataSource,
  Workspace,
} from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import {
  DataSourceConfiguration,
  isTemplatedQuery,
  isTimeFrame,
  RetrievalConfigurationType,
  RetrievalQuery,
  RetrievalTimeframe,
  TimeframeUnitCodec,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";

export const CreateAgentActionSchema = t.type({
  type: t.literal("retrieval_configuration"),
  query: t.union([
    t.type({
      template: t.string,
    }),
    t.literal("auto"),
    t.literal("none"),
  ]),
  timeframe: t.union([
    t.literal("auto"),
    t.literal("none"),
    t.type({
      duration: t.number,
      unit: TimeframeUnitCodec,
    }),
  ]),
  topK: t.number,
  dataSources: t.array(
    t.type({
      dataSourceId: t.string,
      workspaceId: t.string,
      filter: t.type({
        tags: t.union([
          t.type({
            in: t.array(t.string),
            not: t.array(t.string),
          }),
          t.null,
        ]),
        parents: t.union([
          t.type({
            in: t.array(t.string),
            not: t.array(t.string),
          }),
          t.null,
        ]),
      }),
    })
  ),
});
export type CreateAgentActionType = t.TypeOf<typeof CreateAgentActionSchema>;

export const CreateAgentGenerationSchema = t.type({
  prompt: t.string,
  model: t.type({
    providerId: t.string,
    modelId: t.string,
  }),
  temperature: t.number,
});
export type CreateAgentGenerationType = t.TypeOf<
  typeof CreateAgentGenerationSchema
>;

/**
 * Get an agent configuration
 */
export async function getAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (isGlobalAgentId(agentId)) {
    return await getGlobalAgent(auth, agentId);
  }

  const agent = await AgentConfiguration.findOne({
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
    ],
    limit: 1,
  });

  if (!agent) {
    return null;
  }

  let retrievalConfig: RetrievalConfigurationType | null = null;
  if (agent.retrievalConfigurationId) {
    const dataSourcesConfig = await AgentDataSourceConfiguration.findAll({
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
    const actionConfig = agent.retrievalConfiguration;

    if (!actionConfig) {
      throw new Error(
        `Couldn't find action configuration for retrieval configuration ${agent.retrievalConfigurationId}}`
      );
    }

    retrievalConfig = {
      id: actionConfig.id,
      sId: actionConfig.sId,
      type: "retrieval_configuration",
      query: renderRetrievalQueryType(actionConfig),
      relativeTimeFrame: renderRetrievalTimeframeType(actionConfig),
      topK: actionConfig.topK,
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

  const generationConfig = agent.generationConfiguration;

  return {
    id: agent.id,
    sId: agent.sId,
    version: agent.version,
    scope: "workspace",
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    description: agent.description,
    status: agent.status,
    action: retrievalConfig,
    generation: generationConfig
      ? {
          id: generationConfig.id,
          prompt: generationConfig.prompt,
          model: {
            providerId: generationConfig.providerId,
            modelId: generationConfig.modelId,
          },
          temperature: generationConfig.temperature,
        }
      : null,
  };
}

/**
 * Get the list agent configuration for the workspace, optionally whose names
 * match a prefix
 */
export async function getAgentConfigurations(
  auth: Authenticator,
  agentPrefix?: string
): Promise<AgentConfigurationType[] | []> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const rawAgents = await AgentConfiguration.findAll({
    where: {
      workspaceId: owner.id,
      ...(agentPrefix
        ? {
            name: {
              [Op.iLike]: `${agentPrefix}%`,
            },
          }
        : {}),
    },
  });
  const agents = await Promise.all(
    rawAgents.map(async (a) => {
      const agentConfig = await getAgentConfiguration(auth, a.sId);
      if (!agentConfig) {
        throw new Error("AgentConfiguration not found");
      }
      return agentConfig;
    })
  );

  const globalAgents = (await getGlobalAgents(auth)).filter(
    (a) =>
      !agentPrefix || a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
  );

  return [...globalAgents, ...agents];
}

/**
 * Create Or Upgrade Agent Configuration
 * If an agentConfigurationId is provided, it will create a new version of the agent configuration
 * with the same agentConfigurationId.
 * If no agentConfigurationId is provided, it will create a new agent configuration.
 * In both cases, it will return the new agent configuration.
 **/

export async function createOrUpgradeAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    pictureUrl,
    status,
    generation,
    action,
    agentConfigurationId,
  }: {
    name: string;
    description: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
    generation: CreateAgentGenerationType | null;
    action: CreateAgentActionType | null;
    agentConfigurationId?: string;
  }
): Promise<AgentConfigurationType> {
  let generationConfig: AgentGenerationConfigurationType | null = null;
  if (generation)
    generationConfig = await createAgentGenerationConfiguration(auth, {
      prompt: generation.prompt,
      model: {
        providerId: generation.model.providerId,
        modelId: generation.model.modelId,
      },
      temperature: generation.temperature,
    });

  let actionConfig: AgentActionConfigurationType | null = null;
  if (action) {
    actionConfig = await createAgentActionConfiguration(auth, {
      type: "retrieval_configuration",
      query: action.query,
      timeframe: action.timeframe,
      topK: action.topK,
      dataSources: action.dataSources,
    });
  }

  return createAgentConfiguration(auth, {
    name,
    description,
    pictureUrl,
    status,
    generation: generationConfig,
    action: actionConfig,
    agentConfigurationId,
  });
}

/**
 * Create Agent Configuration
 */
async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    pictureUrl,
    status,
    generation,
    action,
    agentConfigurationId,
  }: {
    name: string;
    description: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
    generation: AgentGenerationConfigurationType | null;
    action: AgentActionConfigurationType | null;
    agentConfigurationId?: string;
  }
): Promise<AgentConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  let version = 0;

  const agentConfig = await front_sequelize.transaction(
    async (t): Promise<AgentConfiguration> => {
      if (agentConfigurationId) {
        const latestVersion = await AgentConfiguration.max<
          number | null,
          AgentConfiguration
        >("version", {
          where: {
            workspaceId: owner.id,
            sId: agentConfigurationId,
          },
          transaction: t,
        });

        if (latestVersion !== null) {
          version = latestVersion + 1;
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

      // Create Agent config
      return AgentConfiguration.create(
        {
          sId: agentConfigurationId || generateModelSId(),
          version,
          status: status,
          name: name,
          description: description,
          pictureUrl: pictureUrl,
          workspaceId: owner.id,
          generationConfigurationId: generation?.id || null,
          // We know here that the retrievalConfiguration is one that we created and not a "global
          // virtual" one so we're good to set the foreign key.
          retrievalConfigurationId: action?.id || null,
        },
        {
          transaction: t,
        }
      );
    }
  );

  return {
    id: agentConfig.id,
    sId: agentConfig.sId,
    version: agentConfig.version,
    scope: "workspace",
    name: agentConfig.name,
    description: agentConfig.description,
    pictureUrl: agentConfig.pictureUrl,
    status: agentConfig.status,
    action: action,
    generation: generation,
  };
}

/**
 * Create Agent Generation Configuration
 */
async function createAgentGenerationConfiguration(
  auth: Authenticator,
  {
    prompt,
    model,
    temperature,
  }: {
    prompt: string;
    model: {
      providerId: string;
      modelId: string;
    };
    temperature: number;
  }
): Promise<AgentGenerationConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
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
    model: {
      providerId: genConfig.providerId,
      modelId: genConfig.modelId,
    },
    temperature: genConfig.temperature,
  };
}

/**
 * Create Agent RetrievalConfiguration
 */
async function createAgentActionConfiguration(
  auth: Authenticator,
  {
    type,
    query,
    timeframe,
    topK,
    dataSources,
  }: {
    type: string;
    query: RetrievalQuery;
    timeframe: RetrievalTimeframe;
    topK: number;
    dataSources: DataSourceConfiguration[];
  }
): Promise<AgentActionConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (type !== "retrieval_configuration") {
    throw new Error("Cannot create AgentActionConfiguration: unknow type");
  }

  return await front_sequelize.transaction(async (t) => {
    const retrievalConfig = await AgentRetrievalConfiguration.create(
      {
        sId: generateModelSId(),
        query: isTemplatedQuery(query) ? "templated" : query,
        queryTemplate: isTemplatedQuery(query) ? query.template : null,
        relativeTimeFrame: isTimeFrame(timeframe) ? "custom" : timeframe,
        relativeTimeFrameDuration: isTimeFrame(timeframe)
          ? timeframe.duration
          : null,
        relativeTimeFrameUnit: isTimeFrame(timeframe) ? timeframe.unit : null,
        topK: topK,
      },
      { transaction: t }
    );
    await _createAgentDataSourcesConfigData(t, dataSources, retrievalConfig.id);

    return {
      id: retrievalConfig.id,
      sId: retrievalConfig.sId,
      type: "retrieval_configuration",
      query,
      relativeTimeFrame: timeframe,
      topK,
      dataSources,
    };
  });
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
