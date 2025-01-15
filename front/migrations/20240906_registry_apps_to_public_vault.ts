import config from "@app/lib/api/config";
import { Workspace } from "@app/lib/models/workspace";
import { DustProdActionRegistry } from "@app/lib/registry";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const publicVaultSqid = config.getDustAppsSpaceId();
  const vaultId = getResourceIdFromSId(publicVaultSqid);
  const dustAppsWorkspace = await Workspace.findOne({
    where: { sId: config.getDustAppsWorkspaceId() },
  });
  if (!dustAppsWorkspace) {
    throw new Error(
      `Could not find workspace with sId ${config.getDustAppsWorkspaceId()}`
    );
  }
  if (!vaultId) {
    throw new Error(`Could not find vault with SQID ${publicVaultSqid}`);
  }

  for (const [
    appName,
    {
      app: { appId },
    },
  ] of Object.entries(DustProdActionRegistry)) {
    console.log(
      execute ? "" : "[DRY RUN] ",
      `Updating app ${appName} (sId=${appId}) in ${dustAppsWorkspace.name} workspace ` +
        `(sId=${dustAppsWorkspace.sId}) with vaultId ${vaultId}`
    );
    if (execute) {
      await AppModel.update(
        {
          vaultId,
        },
        {
          where: {
            sId: appId,
            workspaceId: dustAppsWorkspace.id,
          },
        }
      );
      logger.info(
        {
          appName,
          appId,
          workspaceId: config.getDustAppsWorkspaceId(),
          vaultId,
          execute,
        },
        "Updated app"
      );
    }
  }
});
