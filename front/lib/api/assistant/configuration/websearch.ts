import type { ModelId, WebsearchConfigurationType } from "@dust-tt/types";
import _ from "lodash";
import { Op } from "sequelize";

import { DEFAULT_WEBSEARCH_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";

export async function fetchWebsearchActionsConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, WebsearchConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const websearchConfigurations = await AgentWebsearchConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
  });

  if (websearchConfigurations.length === 0) {
    return new Map();
  }

  const groupedWebsearchConfigurations = _.groupBy(
    websearchConfigurations,
    "agentConfigurationId"
  );

  const actionsByConfigurationId: Map<ModelId, WebsearchConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, configs] of Object.entries(
    groupedWebsearchConfigurations
  )) {
    const actions: WebsearchConfigurationType[] = [];
    for (const c of configs) {
      actions.push({
        id: c.id,
        sId: c.sId,
        type: "websearch_configuration",
        name: c.name || DEFAULT_WEBSEARCH_ACTION_NAME,
        description: c.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
