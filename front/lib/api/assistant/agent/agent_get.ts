import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { DataSource, Workspace } from "@app/lib/models";
import {
  AgentDataSourceConfiguration,
  AgentRetrievalConfiguration,
} from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentConfiguration,
  AgentGenerationConfiguration,
} from "@app/lib/models/assistant/agent";
import {
  RetrievalDataSourcesConfiguration,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionConfigurationType,
  AgentConfigurationType,
  AgentFullConfigurationType as AgentFullConfigurationType,
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";

/**
 * Get an agent full configuration from its name
 */
export async function getAgent(
  auth: Authenticator,
  sId: string
): Promise<AgentFullConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find Agent: no workspace");
  }
  const agent = await AgentConfiguration.findOne({
    where: {
      sId: sId,
      workspaceId: owner.id,
    },
  });
  if (!agent) {
    throw new Error("Cannot find Agent: no workspace");
  }
  const agentGeneration = await AgentGenerationConfiguration.findOne({
    where: {
      agentId: agent.id,
    },
  });
  const agentAction = await AgentRetrievalConfiguration.findOne({
    where: {
      agentId: agent.id,
    },
  });
  const agentDataSources = agentAction?.id
    ? await AgentDataSourceConfiguration.findAll({
        where: {
          retrievalConfigurationId: agentAction?.id,
        },
      })
    : [];

  return {
    agent: await _buildAgentConfigurationTypeFromModel({ agent }),
    action: agentAction
      ? await _buildAgentActionConfigurationTypeFromModel(
          agentAction,
          agentDataSources || []
        )
      : null,
    generation: agentGeneration
      ? _buildAgentGenerationConfigurationTypeFromModel(agentGeneration)
      : null,
  };
}

/**
 * Builds the agent configuration type from the model
 */
export async function _buildAgentConfigurationTypeFromModel({
  agent,
}: {
  agent: AgentConfiguration;
}): Promise<AgentConfigurationType> {
  return {
    id: agent.id,
    sId: agent.sId,
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    status: agent.status,
  };
}

/**
 * Builds the agent generation configuration type from the model
 */
export function _buildAgentGenerationConfigurationTypeFromModel(
  generation: AgentGenerationConfiguration
): AgentGenerationConfigurationType {
  return {
    id: generation.id,
    prompt: generation.prompt,
    model: {
      providerId: generation.modelProvider,
      modelId: generation.modelId,
    },
  };
}

/**
 * Builds the agent action configuration type from the model
 */
export async function _buildAgentActionConfigurationTypeFromModel(
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
  const retrievalDataSourcesConfig: RetrievalDataSourcesConfiguration = [];

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

  dataSourcesConfig.forEach(async (dsConfig) => {
    dataSource = dataSources.find((ds) => ds.id === dsConfig.dataSourceId);
    workspace = workspaces.find((w) => w.id === dataSource?.workspaceId);

    if (!dataSource || !workspace) {
      throw new Error("Could not find dataSource or workspace");
    }

    retrievalDataSourcesConfig.push({
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
    query: query,
    relativeTimeFrame: timeframe,
    topK: action.topK,
    type: "retrieval_configuration",
    dataSources: retrievalDataSourcesConfig,
  };
}
