import { Op } from "sequelize";

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
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";

/**
 * Builds the agent configuration type from the model
 */
export async function _getAgentConfigurationType({
  agent,
  action,
  generation,
  dataSources,
}: {
  agent: AgentConfiguration;
  action: AgentRetrievalConfiguration | null;
  generation: AgentGenerationConfiguration | null;
  dataSources: AgentDataSourceConfiguration[] | null;
}): Promise<AgentConfigurationType> {
  return {
    sId: agent.sId,
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    status: agent.status,
    action: action
      ? await _buildAgentActionConfigurationType(action, dataSources || [])
      : null,
    generation: generation
      ? _buildAgentGenerationConfigurationType(generation)
      : null,
  };
}

/**
 * Builds the agent action configuration type from the model
 */
export async function _buildAgentActionConfigurationType(
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
  });
  const workspaceIds = dataSources.map((ds) => ds.workspaceId);
  const workspaces = await Workspace.findAll({
    where: {
      id: { [Op.in]: workspaceIds },
    },
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

/**
 * Builds the agent generation configuration type from the model
 */
export function _buildAgentGenerationConfigurationType(
  generation: AgentGenerationConfiguration
): AgentGenerationConfigurationType {
  return {
    prompt: generation.prompt,
    model: {
      providerId: generation.modelProvider,
      modelId: generation.modelId,
    },
  };
}
