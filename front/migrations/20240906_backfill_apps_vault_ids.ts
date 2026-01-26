import assert from "assert";

import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { makeScript } from "@app/scripts/helpers";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

makeScript({}, async ({ execute }, logger) => {
  const apps = await AppModel.findAll();

  for (const app of apps) {
    const workspace = await WorkspaceResource.fetchByModelId(app.workspaceId);
    assert(workspace, `Failed to find workspace for app ${app.id}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

    if (execute) {
      await app.update({ vaultId: globalSpace.id });
      logger.info(
        {
          workspaceId: workspace.sId,
          appId: app.sId,
          vaultId: globalSpace.sId,
          execute,
        },
        "Updated app"
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.sId,
          appId: app.sId,
          vaultId: globalSpace.sId,
          execute,
        },
        "Would have updated app"
      );
    }
  }
});
