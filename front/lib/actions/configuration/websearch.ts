import { Op } from "sequelize";

import { DEFAULT_WEBSEARCH_ACTION_NAME } from "@app/lib/actions/constants";
import type { WebsearchConfigurationType } from "@app/lib/actions/websearch";
import type { Authenticator } from "@app/lib/auth";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import type { AgentFetchVariant, ModelId } from "@app/types";

export async function fetchWebsearchActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: AgentFetchVariant;
  }
): Promise<Map<ModelId, WebsearchConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const websearchConfigurations = await AgentWebsearchConfiguration.findAll({
    where: {
      agentConfigurationId: { [Op.in]: configurationIds },
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (websearchConfigurations.length === 0) {
    return new Map();
  }

  const actionsByConfigurationId = websearchConfigurations.reduce(
    (acc, config) => {
      const { agentConfigurationId, id, sId, name, description } = config;
      if (!acc.has(agentConfigurationId)) {
        acc.set(agentConfigurationId, []);
      }

      const actions = acc.get(agentConfigurationId);
      if (actions) {
        actions.push({
          id,
          sId,
          type: "websearch_configuration",
          name: name || DEFAULT_WEBSEARCH_ACTION_NAME,
          description,
        });
      }
      return acc;
    },
    new Map<ModelId, WebsearchConfigurationType[]>()
  );

  return actionsByConfigurationId;
}
