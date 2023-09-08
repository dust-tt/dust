import { Op, Transaction } from "sequelize";

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
  isTemplatedQuery,
  isTimeFrame,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentDataSourceConfigurationType,
} from "@app/types/assistant/configuration";

/**
 * Get an agent configuration
 */
export async function getAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find Agent: no workspace");
  }
  const agent = await AgentConfiguration.findOne({
    where: {
      sId: agentId,
      workspaceId: owner.id,
    },
  });
  if (!agent) {
    throw new Error("Cannot find Agent: no workspace");
  }

  const generation = agent.generationId
    ? await AgentGenerationConfiguration.findOne({
        where: {
          id: agent.generationId,
        },
      })
    : null;

  const action = agent.retrievalId
    ? await AgentRetrievalConfiguration.findOne({
        where: {
          id: agent.retrievalId,
        },
      })
    : null;
  const datasources = action?.id
    ? await AgentDataSourceConfiguration.findAll({
        where: {
          retrievalConfigurationId: action.id,
        },
      })
    : [];

  return {
    sId: agent.sId,
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    status: agent.status,
    action: action ? await _agentActionType(action, datasources) : null,
    generation: generation
      ? {
          id: generation.id,
          prompt: generation.prompt,
          model: {
            providerId: generation.providerId,
            modelId: generation.modelId,
          },
        }
      : null,
  };
}

/**
 * Create Agent Configuration
 */
export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    pictureUrl,
    status,
    generation,
    action,
  }: {
    name: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
    generation: {
      prompt: string;
      model: {
        providerId: string;
        modelId: string;
      };
    } | null;
    action: {
      type: string;
      query: RetrievalQuery;
      timeframe: RetrievalTimeframe;
      topK: number;
      dataSources: AgentDataSourceConfigurationType[];
    } | null;
  }
): Promise<AgentConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot create AgentConfiguration without workspace");
  }

  return await front_sequelize.transaction(async (t) => {
    let genConfig: AgentGenerationConfiguration | null = null;
    let retrievalConfig: AgentRetrievalConfiguration | null = null;
    let dataSourcesConfig: AgentDataSourceConfiguration[] = [];

    // Create Generation config
    if (generation) {
      const { prompt, model } = generation;
      genConfig = await AgentGenerationConfiguration.create({
        prompt: prompt,
        providerId: model.providerId,
        modelId: model.modelId,
      });
    }

    // Create Retrieval & Datasources configs
    if (action && action.type === "retrieval_configuration") {
      const { query, timeframe, topK, dataSources } = action;
      retrievalConfig = await AgentRetrievalConfiguration.create(
        {
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
      dataSourcesConfig = await _createAgentDataSourcesConfigData(
        t,
        dataSources,
        retrievalConfig.id
      );
    }

    // Create Agent config
    const agentConfig = await AgentConfiguration.create({
      sId: generateModelSId(),
      status: status,
      name: name,
      pictureUrl: pictureUrl,
      scope: "workspace",
      workspaceId: owner.id,
      generationId: genConfig?.id ?? null,
      retrievalId: retrievalConfig?.id ?? null,
    });

    return {
      sId: agentConfig.sId,
      name: agentConfig.name,
      pictureUrl: agentConfig.pictureUrl,
      status: agentConfig.status,
      action: retrievalConfig
        ? await _agentActionType(retrievalConfig, dataSourcesConfig)
        : null,
      generation: genConfig
        ? {
            id: genConfig.id,
            prompt: genConfig.prompt,
            model: {
              providerId: genConfig.providerId,
              modelId: genConfig.modelId,
            },
          }
        : null,
    };
  });
}

/**
 * Update Agent Generation Configuration
 */
export async function updateAgentGenerationConfiguration(
  auth: Authenticator,
  agentId: string,
  {
    name,
    pictureUrl,
    status,
    generation,
  }: {
    name: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
    generation: {
      prompt: string;
      model: {
        providerId: string;
        modelId: string;
      };
    } | null;
  }
): Promise<AgentConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Workspace not found"
    );
  }
  const agentConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentId,
    },
  });
  if (!agentConfig) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Agent not found"
    );
  }
  const existingGeneration = agentConfig.generationId
    ? await AgentGenerationConfiguration.findOne({
        where: {
          id: agentConfig.generationId,
        },
      })
    : null;

  const existingRetrivalConfig = agentConfig.retrievalId
    ? await AgentRetrievalConfiguration.findOne({
        where: {
          id: agentConfig.retrievalId,
        },
      })
    : null;

  const existingDataSourcesConfig = existingRetrivalConfig?.id
    ? await AgentDataSourceConfiguration.findAll({
        where: {
          retrievalConfigurationId: existingRetrivalConfig.id,
        },
      })
    : [];

  return await front_sequelize.transaction(async (t) => {
    // Upserting Agent Config
    const updatedAgentConfig = await agentConfig.update(
      {
        name: name,
        pictureUrl: pictureUrl,
        status: status,
      },
      { transaction: t }
    );

    // Upserting Generation Config
    let upsertedGenerationConfig: AgentGenerationConfiguration | null = null;
    if (generation) {
      const { prompt, model } = generation;
      if (existingGeneration) {
        upsertedGenerationConfig = await existingGeneration.update(
          {
            prompt: prompt,
            providerId: model.providerId,
            modelId: model.modelId,
          },
          { transaction: t }
        );
      } else {
        upsertedGenerationConfig = await AgentGenerationConfiguration.create(
          {
            prompt: prompt,
            providerId: model.providerId,
            modelId: model.modelId,
          },
          { transaction: t }
        );
      }
    } else if (existingGeneration) {
      await existingGeneration.destroy();
    }

    return {
      sId: updatedAgentConfig.sId,
      name: updatedAgentConfig.name,
      pictureUrl: updatedAgentConfig.pictureUrl,
      status: updatedAgentConfig.status,
      action: existingRetrivalConfig
        ? await _agentActionType(
            existingRetrivalConfig,
            existingDataSourcesConfig
          )
        : null,
      generation:
        generation && upsertedGenerationConfig
          ? {
              id: upsertedGenerationConfig.id,
              prompt: upsertedGenerationConfig.prompt,
              model: {
                providerId: upsertedGenerationConfig.providerId,
                modelId: upsertedGenerationConfig.modelId,
              },
            }
          : null,
    };
  });
}

/**
 * Update Agent Retrieval Configuration
 * This will destroy and recreate the retrieval config
 */
export async function updateAgentRetrievalConfiguration(
  auth: Authenticator,
  agentId: string,
  {
    query,
    timeframe,
    topK,
    dataSources,
  }: {
    query: RetrievalQuery;
    timeframe: RetrievalTimeframe;
    topK: number;
    dataSources: AgentDataSourceConfigurationType[];
  }
): Promise<AgentConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Workspace not found"
    );
  }
  const agentConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentId,
    },
  });
  if (!agentConfig) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Agent not found"
    );
  }
  const generationConfig = agentConfig.generationId
    ? await AgentGenerationConfiguration.findOne({
        where: {
          id: agentConfig.generationId,
        },
      })
    : null;

  return await front_sequelize.transaction(async (t) => {
    if (agentConfig.retrievalId) {
      const existingRetrivalConfig = await AgentRetrievalConfiguration.findOne({
        where: {
          id: agentConfig.retrievalId,
        },
      });
      if (existingRetrivalConfig) {
        await existingRetrivalConfig.destroy(); // That will destroy the dataSourcesConfig too
      }
    }

    const newRetrievalConfig = await AgentRetrievalConfiguration.create(
      {
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
    const dataSourcesConfig = await _createAgentDataSourcesConfigData(
      t,
      dataSources,
      newRetrievalConfig.id
    );

    return {
      sId: agentConfig.sId,
      name: agentConfig.name,
      pictureUrl: agentConfig.pictureUrl,
      status: agentConfig.status,
      action: newRetrievalConfig
        ? await _agentActionType(newRetrievalConfig, dataSourcesConfig)
        : null,
      generation: generationConfig
        ? {
            id: generationConfig.id,
            prompt: generationConfig.prompt,
            model: {
              providerId: generationConfig.providerId,
              modelId: generationConfig.modelId,
            },
          }
        : null,
    };
  });
}

/**
 * Builds the agent action configuration type from the model
 */
export async function _agentActionType(
  action: AgentRetrievalConfiguration,
  dataSourcesConfig: AgentDataSourceConfiguration[]
): Promise<AgentActionConfigurationType> {
  // Build Retrieval Timeframe
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

  // Build Retrieval Query
  let query: RetrievalQuery = "auto";
  if (action.query === "templated" && action.queryTemplate) {
    query = {
      template: action.queryTemplate,
    };
  } else if (action.query === "none") {
    query = "none";
  }

  // Build Retrieval DataSources
  const dataSourcesIds = dataSourcesConfig?.map((ds) => ds.dataSourceId);
  const dataSources = await DataSource.findAll({
    where: {
      id: { [Op.in]: dataSourcesIds },
    },
    attributes: ["id", "name", "workspaceId"],
  });
  const workspaceIds = dataSources.map((ds) => ds.workspaceId);
  const workspaces = await Workspace.findAll({
    where: {
      id: { [Op.in]: workspaceIds },
    },
    attributes: ["id", "sId"],
  });

  let dataSource: DataSource | undefined;
  let workspace: Workspace | undefined;
  const dataSourcesConfigType: AgentDataSourceConfigurationType[] = [];

  dataSourcesConfig.forEach(async (dsConfig) => {
    dataSource = dataSources.find((ds) => ds.id === dsConfig.dataSourceId);
    workspace = workspaces.find((w) => w.id === dataSource?.workspaceId);

    if (!dataSource || !workspace) {
      throw new Error("Could not find dataSource or workspace");
    }

    dataSourcesConfigType.push({
      dataSourceName: dataSource.name,
      workspaceSId: workspace.sId,
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
    });
  });

  return {
    id: action.id,
    type: "retrieval_configuration",
    query: query,
    relativeTimeFrame: timeframe,
    topK: action.topK,
    dataSources: dataSourcesConfigType,
  };
}

/**
 * Create the AgentDataSourceConfiguration rows in database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obvisously need to do as few queries as possible.
 */
export async function _createAgentDataSourcesConfigData(
  t: Transaction,
  dataSourcesConfig: AgentDataSourceConfigurationType[],
  agentActionId: number
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
      sId: dataSourcesConfig.map((dsConfig) => dsConfig.workspaceSId),
    },
    attributes: ["id", "sId"],
  });

  // Now will want to group the datasource names by workspaceId to do only one query per workspace.
  // We want this:
  // [
  //   { workspaceId: 1, dataSourceNames: [""managed-notion", "managed-slack"] },
  //   { workspaceId: 2, dataSourceNames: ["managed-notion"] }
  // ]
  type _DsNamesPerWorkspaceIdType = {
    workspaceId: number;
    dataSourceNames: string[];
  };
  const dsNamesPerWorkspaceId = dataSourcesConfig.reduce(
    (
      acc: _DsNamesPerWorkspaceIdType[],
      curr: AgentDataSourceConfigurationType
    ) => {
      // First we need to get the workspaceId from the workspaceSId
      const workspace = workspaces.find((w) => w.sId === curr.workspaceSId);
      if (!workspace) {
        throw new Error("Workspace not found");
      }

      // Find an existing entry for this workspaceId
      const existingEntry: _DsNamesPerWorkspaceIdType | undefined = acc.find(
        (entry: _DsNamesPerWorkspaceIdType) =>
          entry.workspaceId === workspace.id
      );
      if (existingEntry) {
        // Append dataSourceName to existing entry
        existingEntry.dataSourceNames.push(curr.dataSourceName);
      } else {
        // Add a new entry for this workspaceId
        acc.push({
          workspaceId: workspace.id,
          dataSourceNames: [curr.dataSourceName],
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
            ds.name === dsConfig.dataSourceName &&
            ds.workspaceId ===
              workspaces.find((w) => w.sId === dsConfig.workspaceSId)?.id
        );
        if (!dataSource) {
          throw new Error("DataSource not found");
        }
        return AgentDataSourceConfiguration.create(
          {
            dataSourceId: dataSource.id,
            tagsIn: dsConfig.filter.tags?.in,
            tagsNotIn: dsConfig.filter.tags?.not,
            parentsIn: dsConfig.filter.parents?.in,
            parentsNotIn: dsConfig.filter.parents?.not,
            retrievalConfigurationId: agentActionId,
          },
          { transaction: t }
        );
      })
    );
  return agentDataSourcesConfigRows;
}
