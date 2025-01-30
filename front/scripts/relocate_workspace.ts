import { pauseAllManagedDataSources } from "@app/lib/api/data_sources";
import type { RegionType } from "@app/lib/api/regions/config";
import { config, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { setWorkspaceRelocating } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchWorkspaceRelocationWorkflow } from "@app/temporal/relocation/client";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
    },
    sourceRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
    destinationRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
  },
  async ({ destinationRegion, sourceRegion, workspaceId, execute }, logger) => {
    const currentRegion = config.getCurrentRegion();
    if (sourceRegion !== currentRegion) {
      logger.error(
        `Relocation must be run from the source region. Current region is ${currentRegion}.`
      );
      return;
    }

    if (sourceRegion === destinationRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    logger.info("Start relocating workspace");

    if (execute) {
      // 1) Set the workspace as relocating.
      const updateRes = await setWorkspaceRelocating(owner);
      if (updateRes.isErr()) {
        logger.error(
          `Failed to set workspace as relocating: ${updateRes.error.message}`
        );
        return;
      }

      // 2) Pause all connectors using the connectors API.
      const pauseRes = await pauseAllManagedDataSources(auth, {
        markAsError: true,
      });
      if (pauseRes.isErr()) {
        logger.error(`Failed to pause connectors: ${pauseRes.error.message}`);
        return;
      }

      // 3) Launch the relocation workflow.
      await launchWorkspaceRelocationWorkflow({
        workspaceId: owner.sId,
        sourceRegion,
        destRegion: destinationRegion as RegionType,
      });
    }
  }
);
