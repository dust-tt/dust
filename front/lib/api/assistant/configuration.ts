import { Op, Transaction } from "sequelize";

import {
  getGlobalAgent,
  getGlobalAgents,
  isGlobalAgentId,
} from "@app/lib/api/assistant/global_agents";
import { isSupportedModel, SupportedModel } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentDataSourceConfiguration,
  AgentDustAppRunConfiguration,
  AgentGenerationConfiguration,
  AgentRetrievalConfiguration,
  DataSource,
  Workspace,
} from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import { DustAppRunConfigurationType } from "@app/types/assistant/actions/dust_app_run";
import {
  DataSourceConfiguration,
  isTemplatedQuery,
  isTimeFrame,
  RetrievalConfigurationType,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
  AgentStatus,
} from "@app/types/assistant/agent";

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
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
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
      {
        model: AgentDustAppRunConfiguration,
        as: "dustAppRunConfiguration",
      },
    ],
    limit: 1,
  });

  if (!agent) {
    return null;
  }

  let actionConfig:
    | RetrievalConfigurationType
    | DustAppRunConfigurationType
    | null = null;

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

    actionConfig = {
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

  if (agent.dustAppRunConfigurationId) {
    const dustAppRunConfig = agent.dustAppRunConfiguration;

    if (!dustAppRunConfig) {
      throw new Error(
        `Couldn't find action configuration for DustAppRun configuration ${agent.dustAppRunConfigurationId}}`
      );
    }

    actionConfig = {
      id: dustAppRunConfig.id,
      sId: dustAppRunConfig.sId,
      type: "dust_app_run_configuration",
      appWorkspaceId: dustAppRunConfig.appWorkspaceId,
      appId: dustAppRunConfig.appId,
    };
  }

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

  return {
    id: agent.id,
    sId: agent.sId,
    version: agent.version,
    scope: agent.scope,
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    description: agent.description,
    status: agent.status,
    action: actionConfig,
    generation,
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
      status: "active",
      ...(agentPrefix
        ? {
            name: {
              [Op.iLike]: `${agentPrefix}%`,
            },
          }
        : {}),
    },
    order: [["name", "ASC"]],
  });

  const agents = (
    await Promise.all(
      rawAgents.map(async (a) => {
        return await getAgentConfiguration(auth, a.sId);
      })
    )
  ).filter((a) => a !== null) as AgentConfigurationType[];

  const globalAgents = (await getGlobalAgents(auth)).filter(
    (a) =>
      !agentPrefix || a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
  );

  return [...globalAgents, ...agents];
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
          scope: scope,
          name: name,
          description: description,
          pictureUrl: pictureUrl,
          workspaceId: owner.id,
          generationConfigurationId: generation?.id || null,
          // We know here that these are one that we created and not a "global virtual" one so we're
          // good to set the foreign key.
          retrievalConfigurationId:
            action?.type === "retrieval_configuration" ? action?.id : null,
          dustAppRunConfigurationId:
            action?.type === "dust_app_run_configuration" ? action?.id : null,
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
    scope: agentConfig.scope,
    name: agentConfig.name,
    description: agentConfig.description,
    pictureUrl: agentConfig.pictureUrl,
    status: agentConfig.status,
    action: action,
    generation: generation,
  };
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
        timeframe: RetrievalTimeframe;
        topK: number | "auto";
        dataSources: DataSourceConfiguration[];
      }
    | {
        type: "dust_app_run_configuration";
        appWorkspaceId: string;
        appId: string;
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
          relativeTimeFrame: isTimeFrame(action.timeframe)
            ? "custom"
            : action.timeframe,
          relativeTimeFrameDuration: isTimeFrame(action.timeframe)
            ? action.timeframe.duration
            : null,
          relativeTimeFrameUnit: isTimeFrame(action.timeframe)
            ? action.timeframe.unit
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
        relativeTimeFrame: action.timeframe,
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
