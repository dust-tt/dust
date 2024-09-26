import { groupBy, keyBy, mapValues, uniq } from "lodash";
import { Op } from "sequelize";

import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { GroupVaultModel } from "@app/lib/resources/storage/models/group_vaults";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const allDustAppRunConfigs = await AgentDustAppRunConfiguration.findAll();
  const allDustAppModels = await AppModel.findAll({
    where: {
      sId: allDustAppRunConfigs.map((config) => config.appId),
    },
  });
  const allDustAppVaults = await VaultModel.findAll({
    where: {
      id: allDustAppModels.map((app) => app.vaultId),
    },
  });
  const groupVaults = await GroupVaultModel.findAll({
    where: {
      vaultId: allDustAppVaults.map((vault) => vault.id),
    },
  });
  const groupIdsByVaultId = mapValues(
    groupBy(groupVaults, "vaultId"),
    (groupVaults) => groupVaults.map((groupVault) => groupVault.groupId)
  );
  const dustAppIdsByAgentConfigId = mapValues(
    groupBy(allDustAppRunConfigs, "agentConfigurationId"),
    (configs) => configs.map((config) => config.appId)
  );
  const appByDustAppId = keyBy(allDustAppModels, "sId");

  const affectedAgents = await AgentConfiguration.findAll({
    where: {
      id: uniq(
        allDustAppRunConfigs.map((config) => config.agentConfigurationId)
      ),
      status: {
        [Op.not]: "draft",
      },
    },
  });

  for (const agent of affectedAgents) {
    const dustAppIds = dustAppIdsByAgentConfigId[agent.id];
    const vaultIds = uniq(
      dustAppIds.map((dustAppId) => appByDustAppId[dustAppId].vaultId)
    );
    const groupIds = uniq([
      ...vaultIds.map((vaultId) => groupIdsByVaultId[vaultId]).flat(),
      ...agent.groupIds,
    ]);
    const newGroupIds = groupIds.filter(
      (groupId) => !agent.groupIds.includes(groupId)
    );

    if (newGroupIds.length) {
      console.log(
        !execute ? "[DRY RUN] " : "",
        `Backfilling agent ${agent.sId} with new group ids: ${newGroupIds.join(", ")}`
      );

      if (execute) {
        logger.info(
          { agentId: agent.sId, newGroupIds, prevGroupIds: agent.groupIds },
          `Backfilling agent group IDs`
        );
        await agent.update({
          groupIds,
        });
      }
    }
  }
});
