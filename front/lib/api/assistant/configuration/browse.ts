import type { BrowseConfigurationType, ModelId } from "@dust-tt/types";
import _ from "lodash";
import { Op } from "sequelize";

import { DEFAULT_BROWSE_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";

export async function fetchBrowseActionsConfigurations({
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

  const groupedBrowseConfigurations = _.groupBy(
    browseConfigurations,
    "agentConfigurationId"
  );

  const actionsByConfigurationId: Map<ModelId, BrowseConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, configs] of Object.entries(
    groupedBrowseConfigurations
  )) {
    const actions: BrowseConfigurationType[] = [];
    for (const c of configs) {
      actions.push({
        id: c.id,
        sId: c.sId,
        type: "browse_configuration",
        name: c.name || DEFAULT_BROWSE_ACTION_NAME,
        description: c.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
