import { Op } from "sequelize";

import type { BrowseConfigurationType } from "@app/lib/actions/browse";
import { DEFAULT_BROWSE_ACTION_NAME } from "@app/lib/actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import type { AgentFetchVariant, ModelId } from "@app/types";

export async function fetchBrowseActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: AgentFetchVariant;
  }
): Promise<Map<ModelId, BrowseConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const browseConfigurations = await AgentBrowseConfiguration.findAll({
    where: {
      agentConfigurationId: { [Op.in]: configurationIds },
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (browseConfigurations.length === 0) {
    return new Map();
  }

  const actionsByConfigurationId = browseConfigurations.reduce(
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
          type: "browse_configuration",
          name: name || DEFAULT_BROWSE_ACTION_NAME,
          description,
        });
      }
      return acc;
    },
    new Map<ModelId, BrowseConfigurationType[]>()
  );

  return actionsByConfigurationId;
}
