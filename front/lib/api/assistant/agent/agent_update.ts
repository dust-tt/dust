import {
  _buildAgentActionConfigurationTypeFromModel,
  _buildAgentConfigurationTypeFromModel,
  _buildAgentGenerationConfigurationTypeFromModel,
} from "@app/lib/api/assistant/agent/agent_get";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentDataSourceConfiguration,
  AgentGenerationConfiguration,
  AgentRetrievalConfiguration,
} from "@app/lib/models";
import {
  isTemplatedQuery,
  isTimeFrame,
  RetrievalConfigurationType,
  RetrievalDataSourcesConfiguration,
  RetrievalQuery,
  RetrievalTimeframe,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentGenerationConfigurationType,
} from "@app/types/assistant/agent";

import { _createAgentDataSourcesConfigData } from "./agent_create";

/**
 * Update Agent Configuration
 */
export async function updateAgentConfiguration(
  auth: Authenticator,
  agentSid: string,
  {
    name,
    pictureUrl,
    status,
  }: {
    name: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
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
      sId: agentSid,
    },
  });
  if (!agentConfig) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Agent not found"
    );
  }

  const updatedAgent = await agentConfig.update({
    name: name,
    pictureUrl: pictureUrl,
    status: status,
  });

  return _buildAgentConfigurationTypeFromModel({
    agent: updatedAgent,
  });
}

/**
 * Update Agent Generation Configuration
 */
export async function updateAgentGenerationConfiguration(
  auth: Authenticator,
  agentSid: string,
  {
    prompt,
    modelProvider,
    modelId,
  }: {
    prompt: string;
    modelProvider: string;
    modelId: string;
  }
): Promise<AgentGenerationConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Workspace not found"
    );
  }

  const agentConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentSid,
    },
  });
  if (!agentConfig) {
    throw new Error(
      "Cannot create AgentGenerationConfiguration: Agent not found"
    );
  }

  const generation = await AgentGenerationConfiguration.findOne({
    where: {
      agentId: agentConfig.id,
    },
  });
  if (!generation) {
    throw new Error(
      "Cannot update AgentGenerationConfiguration: Config not found"
    );
  }

  const updatedGeneration = await generation.update({
    prompt: prompt,
    modelProvider: modelProvider,
    modelId: modelId,
  });

  return _buildAgentGenerationConfigurationTypeFromModel(updatedGeneration);
}

/**
 * Update Agent Generation Configuration
 */
export async function updateAgentActionRetrievalConfiguration(
  auth: Authenticator,
  agentSid: string,
  {
    query,
    timeframe,
    topK,
    dataSources,
  }: {
    query: RetrievalQuery;
    timeframe: RetrievalTimeframe;
    topK: number;
    dataSources: RetrievalDataSourcesConfiguration;
  }
): Promise<RetrievalConfigurationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Cannot create AgentActionConfiguration: Workspace not found"
    );
  }

  const agentConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentSid,
    },
  });
  if (!agentConfig) {
    throw new Error("Cannot create AgentActionConfiguration: Agent not found");
  }

  const action = await AgentRetrievalConfiguration.findOne({
    where: {
      agentId: agentConfig.id,
    },
  });
  if (!action) {
    throw new Error("Cannot update AgentActionConfiguration: Config not found");
  }

  // Updating both the Action and datasources in a single transaction
  // So that we update both or none
  return await front_sequelize.transaction(async (t) => {
    // Update Action
    const updatedAction = await action.update(
      {
        query: isTemplatedQuery(query) ? "templated" : query,
        queryTemplate: isTemplatedQuery(query) ? query.template : null,
        relativeTimeFrame: isTimeFrame(timeframe) ? "custom" : timeframe,
        relativeTimeFrameDuration: isTimeFrame(timeframe)
          ? timeframe.duration
          : null,
        relativeTimeFrameUnit: isTimeFrame(timeframe) ? timeframe.unit : null,
        topK: topK,
        agentId: agentConfig.id,
      },
      { transaction: t }
    );

    // Update datasources: we drop and create them all
    await AgentDataSourceConfiguration.destroy({
      where: {
        retrievalConfigurationId: action.id,
      },
    });
    const agentDataSourcesConfigRows = await _createAgentDataSourcesConfigData(
      t,
      dataSources,
      action.id
    );

    return _buildAgentActionConfigurationTypeFromModel(
      updatedAction,
      agentDataSourcesConfigRows
    );
  });
}
