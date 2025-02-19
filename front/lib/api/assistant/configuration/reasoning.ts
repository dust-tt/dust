import type { ModelId, ReasoningConfigurationType } from "@dust-tt/types";
import { Op } from "sequelize";

import { DEFAULT_REASONING_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";

export async function fetchReasoningActionConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, ReasoningConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const reasoningConfigurations = await AgentReasoningConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
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
