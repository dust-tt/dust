import { Op } from "sequelize";

import { DEFAULT_REASONING_ACTION_NAME } from "@app/lib/actions/constants";
import type { ReasoningConfigurationType } from "@app/lib/actions/reasoning";
import type { Authenticator } from "@app/lib/auth";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import type { AgentFetchVariant, ModelId } from "@app/types";

export async function fetchReasoningActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: AgentFetchVariant;
  }
): Promise<Map<ModelId, ReasoningConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const reasoningConfigurations = await AgentReasoningConfiguration.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfigurationId: { [Op.in]: configurationIds },
    },
  });

  if (reasoningConfigurations.length === 0) {
    return new Map();
  }

  const actionsByConfigurationId = reasoningConfigurations.reduce(
    (acc, config) => {
      const {
        agentConfigurationId,
        id,
        sId,
        name,
        description,
        providerId,
        modelId,
        temperature,
        reasoningEffort,
      } = config;
      if (!agentConfigurationId) {
        return acc;
      }
      if (!acc.has(agentConfigurationId)) {
        acc.set(agentConfigurationId, []);
      }
      const actions = acc.get(agentConfigurationId);
      if (actions) {
        actions.push({
          id,
          sId,
          type: "reasoning_configuration",
          name: name || DEFAULT_REASONING_ACTION_NAME,
          description,
          providerId,
          modelId,
          temperature,
          reasoningEffort,
        });
      }
      return acc;
    },
    new Map<ModelId, ReasoningConfigurationType[]>()
  );

  return actionsByConfigurationId;
}
