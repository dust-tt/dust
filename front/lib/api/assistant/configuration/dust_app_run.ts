import type { DustAppRunConfigurationType, ModelId } from "@dust-tt/types";
import _ from "lodash";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AppResource } from "@app/lib/resources/app_resource";

export async function fetchDustAppRunActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: "light" | "full";
  }
): Promise<Map<ModelId, DustAppRunConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const dustAppRunConfigurations = await AgentDustAppRunConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
  });

  if (dustAppRunConfigurations.length === 0) {
    return new Map();
  }

  const dustApps = await AppResource.fetchByIds(
    auth,
    dustAppRunConfigurations.map((c) => c.appId)
  );

  const groupedDustAppRunConfigurations = _.groupBy(
    dustAppRunConfigurations,
    "agentConfigurationId"
  );

  const actionsByConfigurationId: Map<ModelId, DustAppRunConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, configs] of Object.entries(
    groupedDustAppRunConfigurations
  )) {
    const actions: DustAppRunConfigurationType[] = [];
    for (const c of configs) {
      const dustApp = dustApps.find((app) => app.sId === c.appId);

      // If the dust app is not found (was deleted) we just skip the action. This is not ideal as it
      // will change the behavior of the assistant without notice, but we don't want to crash or let
      // the app be used if it was deleted.
      if (dustApp) {
        actions.push({
          id: c.id,
          sId: c.sId,
          type: "dust_app_run_configuration",
          appWorkspaceId: c.appWorkspaceId,
          appId: c.appId,
          name: dustApp.name,
          description: dustApp.description,
        });
      }
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
