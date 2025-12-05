import { updateWorkspaceRegionMetadata } from "@app/admin/relocate_users";
import type { RegionType } from "@app/lib/api/regions/config";
import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      describe: "The workspace ID to update",
      type: "string",
      demandOption: true,
    },
    region: {
      describe: "The region to set for the workspace",
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
  },
  async ({ workspaceId, region, execute }, logger) => {
    if (!isRegionType(region)) {
      logger.error({ region }, "Invalid region type.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    logger.info(
      { workspaceId: workspace.sId, region, execute },
      "About to update workspace region metadata"
    );

    const result = await updateWorkspaceRegionMetadata(auth, logger, {
      execute,
      newRegion: region as RegionType,
    });

    if (result.isErr()) {
      logger.error(
        { error: result.error.message },
        "Failed to update workspace region metadata"
      );
      return;
    }

    logger.info(
      { workspaceId: workspace.sId, region },
      "Successfully updated workspace region metadata"
    );
  }
);
