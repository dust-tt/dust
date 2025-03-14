import { Op } from "sequelize";

import { DEFAULT_BROWSE_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import type { BrowseConfigurationType, ModelId } from "@app/types";

export async function fetchBrowseActionConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, BrowseConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const browseConfigurations = await AgentBrowseConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
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
