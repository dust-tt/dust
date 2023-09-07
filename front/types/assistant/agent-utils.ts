import { DataSource } from "@app/lib/models";
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
export function _getAgentConfigurationType({
  agent,
  action,
  generation,
  dataSources,
}: {
  agent: AgentConfiguration;
  action: AgentRetrievalConfiguration | null;
  generation: AgentGenerationConfiguration | null;
  dataSources: AgentDataSourceConfiguration[] | null;
}): AgentConfigurationType {
  return {
    sId: agent.sId,
    name: agent.name,
    pictureUrl: agent.pictureUrl,
    status: agent.status,
    action: action
      ? _buildAgentActionConfigurationType(action, dataSources)
      : null,
    generation: generation
      ? _buildAgentGenerationConfigurationType(generation)
      : null,
  };
}

/**
 * Builds the agent action configuration type from the model
 */
export function _buildAgentActionConfigurationType(
  action: AgentRetrievalConfiguration,
  dataSourcesConfig: AgentDataSourceConfiguration[] | null
): AgentActionConfigurationType {
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
  let dataSource: DataSource | null = null;

  dataSourcesConfig?.forEach(async (dsConfig) => {
    dataSource = await DataSource.findOne({
      where: {
        id: dsConfig.dataSourceId,
      },
    });

    if (!dataSource) {
      return;
    }
    retrievalDataSourcesConfig.push({
      name: dataSource.name,
      workspaceId: dataSource.workspaceId,
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
