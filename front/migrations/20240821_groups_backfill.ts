import type { LightWorkspaceType } from "@dust-tt/types";
import type { Logger } from "pino";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupVaultModel } from "@app/lib/resources/storage/models/group_vault";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function backfillGroupVault(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  logger.info("Backfill group vault for workspace(%s)", workspace.sId);

  const systemGroup = await GroupResource.fetchWorkspaceSystemGroup(auth);
  const systemVault = await VaultResource.fetchWorkspaceSystemVault(auth);
  if (execute) {
    await GroupVaultModel.findOrCreate({
      where: { groupId: systemGroup.id, vaultId: systemVault.id },
      defaults: { groupId: systemGroup.id, vaultId: systemVault.id },
    });
  }

  const globalGroup = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
  if (execute) {
    await GroupVaultModel.findOrCreate({
      where: { groupId: globalGroup.id, vaultId: globalVault.id },
      defaults: { groupId: globalGroup.id, vaultId: globalVault.id },
    });
  }

  console.log(`Done.`);
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillGroupVault(workspace, logger, execute);

    logger.info(`Finished backfilling views for workspace(${workspace.sId}).`);
  });
});
