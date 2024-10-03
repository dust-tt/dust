import assert from "assert";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const apps = await AppModel.findAll();

  for (const app of apps) {
    const workspace = await Workspace.findOne({
      where: { id: app.workspaceId },
    });
    assert(workspace, `Failed to find workspace for app ${app.id}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);

    if (execute) {
      await app.update({ vaultId: globalVault.id });
      logger.info(
        {
          workspaceId: workspace.sId,
          appId: app.sId,
          vaultId: globalVault.sId,
          execute,
        },
        "Updated app"
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.sId,
          appId: app.sId,
          vaultId: globalVault.sId,
          execute,
        },
        "Would have updated app"
      );
    }
  }
});
